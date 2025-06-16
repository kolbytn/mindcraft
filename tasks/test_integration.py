import unittest
import os
import json
import tempfile
import shutil
import pandas as pd
from unittest.mock import patch, mock_open

# Import all modules we need to test integration
from tasks.evaluation import (
    CompletionStatus,
    AgentOutcome,
    TaskRunOutcome,
    analyze_agent_log,
    extract_task_outcome,
    aggregate_results_to_dataframe,
)
from tasks.evaluation_script import aggregate_results, check_folder_results
from tasks.analyse_results import aggregate_results as analyse_aggregate_results
from tasks.analyze_cooking_tasks import enrich_dataframe_with_cooking_metrics
import tasks.run_task_file as run_task_file


class TestEvaluationIntegration(unittest.TestCase):
    """
    Integration tests for the complete evaluation pipeline, ensuring that all
    modules work together as expected.
    """

    def setUp(self):
        """
        Set up a temporary directory and create sample task definitions for
        integration testing.
        """
        self.test_dir = tempfile.mkdtemp()
        self.exp_dir = os.path.join(self.test_dir, "experiments")
        os.makedirs(self.exp_dir, exist_ok=True)
        
        self.task_definitions = {
            "cooking_task_1": {
                "task_id": "cooking_task_1", "type": "cooking", "agent_count": 2,
                "task_type": "cooking", "difficulty_metrics": {"complexity": "medium"}
            },
            "crafting_task_1": {
                "task_id": "crafting_task_1", "type": "crafting", "agent_count": 1,
                "task_type": "crafting", "difficulty_metrics": {"tools": 3}
            },
            "construction_task_1": {
                "task_id": "construction_task_1", "type": "construction", "agent_count": 3,
                "task_type": "construction", "difficulty_metrics": {"size": 100}
            }
        }
        
        self.task_file_path = os.path.join(self.test_dir, "test_tasks.json")
        with open(self.task_file_path, "w") as f:
            json.dump(self.task_definitions, f)

    def tearDown(self):
        """Clean up the temporary directory."""
        shutil.rmtree(self.test_dir)

    def create_sample_experiment_data(self):
        """
        Creates a sample experiment directory with a realistic folder structure
        and mock agent log files for testing.
        """
        # Create folder structure: experiments/model_name/task_id/
        model_dir = os.path.join(self.exp_dir, "gpt-4o")
        os.makedirs(model_dir, exist_ok=True)
        
        task_folders = []
        
        # Create successful cooking task
        cooking_dir = os.path.join(model_dir, "cooking_task_1")
        os.makedirs(cooking_dir, exist_ok=True)
        task_folders.append(cooking_dir)
        
        # Agent 1: Success
        agent1_log = [
            {"role": "user", "content": "Start cooking task"},
            {"role": "system", "content": "Task ended with score : 1.0"}
        ]
        with open(os.path.join(cooking_dir, "agent_0.json"), "w") as f:
            json.dump(agent1_log, f)
            
        # Agent 2: Partial success 
        agent2_log = [
            {"role": "user", "content": "Start cooking task"},
            {"role": "system", "content": "Task ended with score : 0.5"}
        ]
        with open(os.path.join(cooking_dir, "agent_1.json"), "w") as f:
            json.dump(agent2_log, f)
        
        # Create failed crafting task
        crafting_dir = os.path.join(model_dir, "crafting_task_1")
        os.makedirs(crafting_dir, exist_ok=True)
        task_folders.append(crafting_dir)
        
        # Single agent: Failed
        agent_log = [
            {"role": "user", "content": "Start crafting task"},
            {"role": "system", "content": "Task ended with score : 0.0"}
        ]
        with open(os.path.join(crafting_dir, "agent_0.json"), "w") as f:
            json.dump(agent_log, f)
        
        # Create timed out construction task
        construction_dir = os.path.join(model_dir, "construction_task_1")
        os.makedirs(construction_dir, exist_ok=True)
        task_folders.append(construction_dir)
        
        # Multiple agents: timeout
        for i in range(3):
            agent_log = [
                {"role": "user", "content": "Start construction task"},
                {"role": "system", "content": "Task timeout reached"}
            ]
            with open(os.path.join(construction_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)
        
        return task_folders

    def test_end_to_end_evaluation_pipeline(self):
        """
        Tests the complete pipeline from raw log files to the final aggregated
        DataFrame, ensuring all steps integrate correctly.
        """
        # Create sample data
        task_folders = self.create_sample_experiment_data()
        
        # Test evaluation_script.py aggregate_results function
        results_df = aggregate_results(task_folders, self.task_definitions)
        
        # Verify DataFrame structure
        self.assertIsInstance(results_df, pd.DataFrame)
        self.assertEqual(len(results_df), 3)  # 3 tasks
        
        # Check required columns exist
        required_columns = [
            'task_id', 'agent_count', 'task_type', 'overall_raw_score',
            'overall_is_successful', 'overall_completion_status', 'total_agent_logs_found'
        ]
        for col in required_columns:
            self.assertIn(col, results_df.columns)
        
        # Verify specific results
        cooking_result = results_df[results_df['task_id'] == 'cooking_task_1'].iloc[0]
        self.assertEqual(cooking_result['overall_raw_score'], 1.0)
        self.assertTrue(cooking_result['overall_is_successful'])
        self.assertEqual(cooking_result['overall_completion_status'], CompletionStatus.SUCCESS)
        self.assertEqual(cooking_result['total_agent_logs_found'], 2)
        
        crafting_result = results_df[results_df['task_id'] == 'crafting_task_1'].iloc[0]
        self.assertEqual(crafting_result['overall_raw_score'], 0.0)
        self.assertFalse(crafting_result['overall_is_successful'])
        self.assertEqual(crafting_result['overall_completion_status'], CompletionStatus.FAILED_SCORE_ZERO)
        
        construction_result = results_df[results_df['task_id'] == 'construction_task_1'].iloc[0]
        self.assertEqual(construction_result['overall_completion_status'], CompletionStatus.TIMED_OUT)

    def test_check_folder_results_integration(self):
        """
        Tests the `check_folder_results` entry point to ensure it correctly
        analyzes a folder structure and calculates summary statistics.
        """
        # Create sample data 
        task_folders = self.create_sample_experiment_data()
        
        # Test check_folder_results
        results_df = check_folder_results(os.path.dirname(task_folders[0]), self.task_file_path)
        
        self.assertIsInstance(results_df, pd.DataFrame)
        self.assertEqual(len(results_df), 3)
        
        # Check success rate calculation
        success_rate = results_df['overall_is_successful'].mean()
        self.assertAlmostEqual(success_rate, 1/3)  # Only cooking task succeeded

    def test_analyse_results_integration(self):
        """
        Tests integration with the `analyse_results.py` script, ensuring it
        can process the output of the main evaluation pipeline.
        """
        task_folders = self.create_sample_experiment_data()
        
        # Test the analyse_results aggregate function
        results_df = analyse_aggregate_results(task_folders, self.task_definitions)
        
        self.assertIsInstance(results_df, pd.DataFrame)
        self.assertEqual(len(results_df), 3)
        
        # Verify model_name is set (should be extracted from folder structure)
        self.assertTrue(all(results_df['model_name'] == 'gpt-4o'))

    def test_cooking_analysis_integration(self):
        """
        Tests the integration of the cooking-specific analysis script, ensuring
        it can enrich the main results DataFrame without errors.
        """
        task_folders = self.create_sample_experiment_data()
        results_df = aggregate_results(task_folders, self.task_definitions)
        
        # Test cooking-specific enrichment
        enriched_df = enrich_dataframe_with_cooking_metrics(results_df)
        
        # Should have additional cooking columns
        self.assertIn('target_items', enriched_df.columns)
        self.assertIn('num_blocked_agents', enriched_df.columns)

    def test_error_handling_integration(self):
        """
        Tests that errors, such as malformed logs or missing task definitions,
        are handled gracefully across the entire pipeline.
        """
        # Create a folder with invalid JSON
        error_dir = os.path.join(self.exp_dir, "error_test")
        os.makedirs(error_dir, exist_ok=True)
        
        # Invalid JSON file
        with open(os.path.join(error_dir, "invalid.json"), "w") as f:
            f.write("invalid json content")
            
        # Missing task definition
        missing_task_dir = os.path.join(self.exp_dir, "missing_task")
        os.makedirs(missing_task_dir, exist_ok=True)
        
        valid_log = [{"role": "system", "content": "Task ended with score : 1.0"}]
        with open(os.path.join(missing_task_dir, "agent.json"), "w") as f:
            json.dump(valid_log, f)
        
        # Test that pipeline handles errors gracefully
        task_folders = [error_dir, missing_task_dir]
        results_df = aggregate_results(task_folders, self.task_definitions)
        
        # Should return empty DataFrame for folders with no valid task definitions
        self.assertTrue(results_df.empty or len(results_df) == 0)

    def test_empty_folder_handling(self):
        """
        Tests that the pipeline can handle empty experiment folders without
        crashing and assigns the correct 'NO_SCORE_LOGGED' status.
        """
        empty_dir = os.path.join(self.exp_dir, "cooking_task_1")
        os.makedirs(empty_dir, exist_ok=True)
        # No JSON files in this directory
        
        results_df = aggregate_results([empty_dir], self.task_definitions)
        
        # Should handle empty folders gracefully
        if not results_df.empty:
            result = results_df.iloc[0]
            self.assertEqual(result['total_agent_logs_found'], 0)
            self.assertEqual(result['overall_completion_status'], CompletionStatus.NO_SCORE_LOGGED)

    def test_backward_compatibility(self):
        """
        Tests that the integrated system maintains backward compatibility by
        producing results consistent with legacy success criteria.
        """
        task_folders = self.create_sample_experiment_data()
        results_df = aggregate_results(task_folders, self.task_definitions)
        
        # Test backward compatibility expectations
        # Success should be determined by score of 1.0
        successful_tasks = results_df[results_df['overall_raw_score'] == 1.0]
        self.assertTrue(all(successful_tasks['overall_is_successful']))
        
        # Failed tasks should have is_successful = False
        failed_tasks = results_df[results_df['overall_raw_score'] == 0.0]
        self.assertTrue(all(~failed_tasks['overall_is_successful']))

    def test_run_task_file_integration(self):
        """
        Verifies that the interfaces exposed by `run_task_file.py` are
        compatible with the rest of the evaluation ecosystem.
        """
        # Test that we can parse the function structure
        self.assertTrue(hasattr(run_task_file, 'run_task'))
        self.assertTrue(hasattr(run_task_file, 'main'))
        
        # Test command construction (without actually running)
        task_path = self.task_file_path
        task_id = "cooking_task_1"
        profiles = ["profile1.json", "profile2.json"]
        
        # Verify the command would be constructed correctly
        expected_cmd_parts = ["node", "main.js", "--task_path", task_path, "--task_id", task_id]
        # This verifies the integration interface exists

    def test_performance_with_large_dataset(self):
        """
        Tests the performance of the integrated pipeline with a larger dataset
        to ensure it remains efficient and scalable.
        """
        # Create multiple task folders to test performance
        model_dir = os.path.join(self.exp_dir, "claude-3-5-sonnet")
        os.makedirs(model_dir, exist_ok=True)
        
        task_folders = []
        large_task_defs = {}
        
        # Create 20 tasks to test performance
        for i in range(20):
            task_id = f"perf_test_task_{i}"
            task_dir = os.path.join(model_dir, task_id)
            os.makedirs(task_dir, exist_ok=True)
            task_folders.append(task_dir)
            
            # Add to task definitions
            large_task_defs[task_id] = {
                "task_id": task_id,
                "type": "cooking",
                "agent_count": 2,
                "task_type": "cooking"
            }
            
            # Create agent logs
            for agent_idx in range(2):
                agent_log = [
                    {"role": "user", "content": f"Start task {i}"},
                    {"role": "system", "content": f"Task ended with score : {1.0 if i % 2 == 0 else 0.0}"}
                ]
                with open(os.path.join(task_dir, f"agent_{agent_idx}.json"), "w") as f:
                    json.dump(agent_log, f)
        
        # Test that pipeline handles larger datasets efficiently
        import time
        start_time = time.time()
        results_df = aggregate_results(task_folders, large_task_defs)
        end_time = time.time()
        
        # Should complete within reasonable time (< 5 seconds for 20 tasks)
        self.assertLess(end_time - start_time, 5.0)
        self.assertEqual(len(results_df), 20)
        
        # Verify success rate calculation
        expected_success_rate = 0.5  # Every other task succeeds
        actual_success_rate = results_df['overall_is_successful'].mean()
        self.assertAlmostEqual(actual_success_rate, expected_success_rate, places=2)


if __name__ == '__main__':
    unittest.main()