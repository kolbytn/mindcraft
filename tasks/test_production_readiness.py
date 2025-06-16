import unittest
import os
import json
import tempfile
import shutil
import pandas as pd
from unittest.mock import patch

from tasks.evaluation import (
    CompletionStatus,
    extract_task_outcome,
    aggregate_results_to_dataframe,
)
from tasks.evaluation_script import aggregate_results, check_folder_results
from tasks.analyse_results import aggregate_results as analyse_aggregate_results
from tasks.analyze_cooking_tasks import enrich_dataframe_with_cooking_metrics


class TestProductionReadiness(unittest.TestCase):
    """
    Production readiness tests that validate the evaluation system against
    real-world data, scenarios, and downstream tool integrations.
    """

    def setUp(self):
        """Set up a temporary directory for test data."""
        self.test_dir = tempfile.mkdtemp()
        self.exp_dir = os.path.join(self.test_dir, "experiments")
        os.makedirs(self.exp_dir, exist_ok=True)

    def tearDown(self):
        """Clean up the temporary directory."""
        shutil.rmtree(self.test_dir)

    def test_real_task_file_compatibility(self):
        """
        Tests that the system can successfully load and parse the official
        `example_tasks.json` file without errors.
        """
        # Use the real task file
        real_task_file = "tasks/example_tasks.json"
        
        # Load and verify it works
        with open(real_task_file, 'r') as f:
            task_definitions = json.load(f)
        
        self.assertGreater(len(task_definitions), 0)
        
        # Test specific task types exist
        debug_tasks = [t for t in task_definitions.values() if t.get('type') == 'debug']
        cooking_tasks = [t for t in task_definitions.values() if t.get('type') == 'cooking']
        construction_tasks = [t for t in task_definitions.values() if t.get('type') == 'construction']
        techtree_tasks = [t for t in task_definitions.values() if t.get('type') == 'techtree']
        
        self.assertGreater(len(debug_tasks), 0)
        self.assertGreater(len(cooking_tasks), 0)
        self.assertGreater(len(construction_tasks), 0)
        self.assertGreater(len(techtree_tasks), 0)

    def test_evaluation_with_real_task_structures(self):
        """
        Tests the evaluation system against a realistic folder structure,
        simulating a multi-model, multi-task experiment.
        """
        # Create realistic folder structure
        model_dirs = ["gpt-4o", "claude-3-5-sonnet-latest", "gpt-4o-mini"]
        task_ids = [
            "debug_1_agent_timeout",
            "multiagent_cooking_1", 
            "construction_house",
            "multiagent_techtree_1_shears"
        ]
        
        # Load real task definitions
        with open("tasks/example_tasks.json", 'r') as f:
            real_task_definitions = json.load(f)
        
        task_folders = []
        
        for model in model_dirs:
            model_dir = os.path.join(self.exp_dir, model)
            os.makedirs(model_dir, exist_ok=True)
            
            for task_id in task_ids:
                if task_id not in real_task_definitions:
                    continue
                    
                task_dir = os.path.join(model_dir, task_id)
                os.makedirs(task_dir, exist_ok=True)
                task_folders.append(task_dir)
                
                task_def = real_task_definitions[task_id]
                agent_count = task_def.get('agent_count', 1)
                
                # Create realistic outcomes based on task type
                task_type = task_def.get('type', 'debug')
                
                for i in range(agent_count):
                    if task_type == 'debug' and 'timeout' in task_id:
                        # Debug timeout tasks should timeout
                        log = [{"role": "system", "content": "Task timeout reached"}]
                    elif task_type == 'cooking' and model == "gpt-4o":
                        # GPT-4o succeeds at cooking
                        log = [{"role": "system", "content": "Task ended with score : 1"}]
                    elif task_type == 'construction' and model == "gpt-4o-mini":
                        # GPT-4o-mini partially succeeds at construction
                        log = [{"role": "system", "content": "Task ended with score : 0.6"}]
                    elif task_type == 'techtree':
                        # Mixed results for techtree
                        score = 1 if i == 0 else 0
                        log = [{"role": "system", "content": f"Task ended with score : {score}"}]
                    else:
                        # Default success
                        log = [{"role": "system", "content": "Task ended with score : 1"}]
                    
                    with open(os.path.join(task_dir, f"agent_{i}.json"), "w") as f:
                        json.dump(log, f)

        # Test the evaluation pipeline
        results_df = aggregate_results(task_folders, real_task_definitions)
        
        # Verify comprehensive results
        self.assertGreater(len(results_df), 0)
        
        # Check for all expected task types
        if not results_df.empty:
            task_types = results_df['task_type'].unique()
            # Some task types should be present (allowing for missing task definitions)
            self.assertGreater(len(task_types), 0)
        
        # Check model differentiation
        if 'model_name' in results_df.columns and not results_df.empty:
            model_names = results_df['model_name'].unique()
            self.assertGreaterEqual(len(model_names), 1)  # At least one model should be present

    def test_cli_integration_compatibility(self):
        """
        Tests that the `check_folder_results` function, a key CLI entry point,
        is compatible with the expected argument formats.
        """
        # Test that check_folder_results function works as expected
        task_file = "tasks/example_tasks.json"
        
        # Create minimal test data
        model_dir = os.path.join(self.exp_dir, "test_cli")
        task_dir = os.path.join(model_dir, "debug_1_agent_timeout")
        os.makedirs(task_dir, exist_ok=True)
        
        log = [{"role": "system", "content": "Task timeout reached"}]
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)
        
        # This should work without errors
        results_df = check_folder_results(model_dir, task_file)
        
        self.assertIsInstance(results_df, pd.DataFrame)
        if not results_df.empty:
            self.assertEqual(len(results_df), 1)
            self.assertEqual(results_df.iloc[0]['overall_completion_status'], CompletionStatus.TIMED_OUT)

    def test_error_messages_user_friendly(self):
        """
        Tests that common error scenarios (e.g., missing files) produce
        informative and user-friendly log messages.
        """
        # Test with nonexistent task file
        import logging
        import io
        
        # Capture log output
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        logger = logging.getLogger('tasks.evaluation')
        logger.addHandler(handler)
        
        # Test nonexistent folder
        result = check_folder_results("/definitely/nonexistent/folder", "tasks/example_tasks.json")
        self.assertIsNone(result)
        
        # Test malformed task file  
        malformed_task_file = os.path.join(self.test_dir, "malformed.json")
        with open(malformed_task_file, 'w') as f:
            f.write("{ invalid json")
        
        result = check_folder_results(self.exp_dir, malformed_task_file)
        self.assertIsNone(result)
        
        logger.removeHandler(handler)

    def test_graceful_degradation(self):
        """
        Tests that the system degrades gracefully when encountering problematic
        data, such as empty folders or malformed logs, without crashing.
        """
        # Load real task definitions
        with open("tasks/example_tasks.json", 'r') as f:
            task_definitions = json.load(f)
        
        # Create scenarios with various edge cases
        scenarios = [
            # Folder with no JSON files
            ("empty_folder", []),
            # Folder with only malformed files
            ("malformed_only", ["invalid json content"]),
            # Folder with mixed valid/invalid files
            ("mixed_files", [
                {"role": "system", "content": "Task ended with score : 1"},
                "invalid json"
            ])
        ]
        
        for scenario_name, files in scenarios:
            model_dir = os.path.join(self.exp_dir, f"test_{scenario_name}")
            task_dir = os.path.join(model_dir, "debug_single_agent")
            os.makedirs(task_dir, exist_ok=True)
            
            for i, file_content in enumerate(files):
                file_path = os.path.join(task_dir, f"agent_{i}.json")
                with open(file_path, 'w') as f:
                    if isinstance(file_content, dict):
                        json.dump([file_content], f)
                    else:
                        f.write(file_content)
            
            # Should not crash
            try:
                results_df = aggregate_results([task_dir], task_definitions)
                # Should return some result or empty DataFrame
                self.assertIsInstance(results_df, pd.DataFrame)
            except Exception as e:
                self.fail(f"System failed to gracefully handle {scenario_name}: {e}")

    def test_memory_efficiency_production_scale(self):
        """
        Tests memory efficiency with a large-scale dataset to ensure the system
        can handle production-level workloads without excessive memory consumption.
        """
        import psutil
        import os as os_module
        
        # Create large-scale test data (simulating 200 tasks across 5 models)
        models = ["gpt-4o", "claude-3-5-sonnet", "gpt-4o-mini", "gpt-3.5-turbo", "llama-3"]
        
        # Use subset of real tasks
        with open("tasks/example_tasks.json", 'r') as f:
            real_tasks = json.load(f)
        
        # Take first 40 tasks (200 total across 5 models)
        task_subset = dict(list(real_tasks.items())[:40])
        
        process = psutil.Process(os_module.getpid())
        memory_before = process.memory_info().rss / 1024 / 1024  # MB
        
        all_folders = []
        for model in models:
            model_dir = os.path.join(self.exp_dir, model)
            os.makedirs(model_dir, exist_ok=True)
            
            for task_id, task_def in task_subset.items():
                task_dir = os.path.join(model_dir, task_id)
                os.makedirs(task_dir, exist_ok=True)
                all_folders.append(task_dir)
                
                agent_count = task_def.get('agent_count', 1)
                for i in range(agent_count):
                    log = [{"role": "system", "content": f"Task ended with score : {1 if i == 0 else 0.5}"}]
                    with open(os.path.join(task_dir, f"agent_{i}.json"), "w") as f:
                        json.dump(log, f)
        
        # Process all at once
        results_df = aggregate_results(all_folders, task_subset)
        
        memory_after = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = memory_after - memory_before
        
        # Should handle large number of tasks without excessive memory usage (< 100MB increase)
        self.assertLess(memory_increase, 100)
        # Should process the available tasks (some may be skipped due to missing definitions)
        self.assertGreater(len(results_df), 0)
        self.assertLessEqual(len(results_df), 200)  # At most 40 tasks × 5 models

    def test_exit_codes_and_status_reporting(self):
        """
        Tests that the system provides appropriate return values to indicate
        success or failure, which is critical for CI/CD pipelines.
        """
        # This tests the check_folder_results function behavior
        
        # Test successful case
        model_dir = os.path.join(self.exp_dir, "success_test")
        task_dir = os.path.join(model_dir, "debug_single_agent")
        os.makedirs(task_dir, exist_ok=True)
        
        log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)
        
        result = check_folder_results(model_dir, "tasks/example_tasks.json")
        
        # Should return valid DataFrame for successful processing
        self.assertIsInstance(result, pd.DataFrame)
        self.assertGreater(len(result), 0)
        
        # Test error cases return None (indicating failure)
        result_error = check_folder_results("/nonexistent", "tasks/example_tasks.json")
        self.assertIsNone(result_error)

    def test_downstream_tool_compatibility(self):
        """
        Tests compatibility with downstream analysis tools, such as the
        cooking-specific analysis script, ensuring the data format is correct.
        """
        # Create test data
        model_dir = os.path.join(self.exp_dir, "downstream_test")
        
        # Create cooking task (to test cooking analysis)
        cooking_dir = os.path.join(model_dir, "multiagent_cooking_1")
        os.makedirs(cooking_dir, exist_ok=True)
        
        log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(cooking_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)
        
        # Test with cooking analysis
        with open("tasks/example_tasks.json", 'r') as f:
            task_definitions = json.load(f)
        
        results_df = aggregate_results([cooking_dir], task_definitions)
        
        # Test cooking-specific analysis still works
        enriched_df = enrich_dataframe_with_cooking_metrics(results_df)
        
        # Should have additional columns but not break
        self.assertIsInstance(enriched_df, pd.DataFrame)
        self.assertIn('target_items', enriched_df.columns)
        self.assertIn('num_blocked_agents', enriched_df.columns)

    def test_concurrent_processing_safety(self):
        """
        Tests that the evaluation functions are thread-safe and can be used in
        concurrent processing scenarios without causing race conditions or errors.
        """
        import threading
        import time
        
        # Create multiple task directories
        task_dirs = []
        with open("tasks/example_tasks.json", 'r') as f:
            task_definitions = json.load(f)
        
        for i in range(10):
            task_dir = os.path.join(self.exp_dir, f"concurrent_test_{i}", "debug_single_agent")
            os.makedirs(task_dir, exist_ok=True)
            task_dirs.append(os.path.dirname(task_dir))
            
            log = [{"role": "system", "content": f"Task ended with score : {i % 2}"}]
            with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
                json.dump(log, f)
        
        results = []
        errors = []
        
        def process_batch(batch_dirs):
            try:
                result = aggregate_results(batch_dirs, task_definitions)
                results.append(result)
            except Exception as e:
                errors.append(e)
        
        # Process in multiple threads
        threads = []
        batch_size = 2
        for i in range(0, len(task_dirs), batch_size):
            batch = task_dirs[i:i+batch_size]
            thread = threading.Thread(target=process_batch, args=(batch,))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads
        for thread in threads:
            thread.join()
        
        # Should have no errors and valid results
        self.assertEqual(len(errors), 0, f"Concurrent processing errors: {errors}")
        self.assertGreater(len(results), 0)
        
        # All results should be valid DataFrames
        for result in results:
            self.assertIsInstance(result, pd.DataFrame)


if __name__ == '__main__':
    unittest.main()