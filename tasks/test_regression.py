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
from tasks.evaluation_script import aggregate_results


class TestRegressionCompatibility(unittest.TestCase):
    """
    Regression tests to ensure the new evaluation system maintains backward
    compatibility with legacy data formats and logic.
    """

    def setUp(self):
        """Set up a temporary directory for test data."""
        self.test_dir = tempfile.mkdtemp()
        self.exp_dir = os.path.join(self.test_dir, "experiments")
        os.makedirs(self.exp_dir, exist_ok=True)

    def tearDown(self):
        """Clean up the temporary directory."""
        shutil.rmtree(self.test_dir)

    def create_legacy_compatible_data(self):
        """
        Creates a mock experiment directory with log files that mimic the
        output patterns and scoring of the legacy system.
        """
        # Task definitions matching legacy format
        task_definitions = {
            "multiagent_cooking_1_cooked_chicken_1_golden_carrot": {
                "task_id": "multiagent_cooking_1_cooked_chicken_1_golden_carrot",
                "type": "cooking",
                "agent_count": 2,
                "task_type": "cooking",
                "difficulty_metrics": {
                    "total_recipe_steps": 4,
                    "unique_target_items": 2
                }
            },
            "multiagent_crafting_1_wooden_sword": {
                "task_id": "multiagent_crafting_1_wooden_sword",
                "type": "crafting", 
                "agent_count": 2,
                "task_type": "crafting",
                "difficulty_metrics": {
                    "total_steps": 3,
                    "required_tools": 1
                }
            },
            "construction_small_house": {
                "task_id": "construction_small_house",
                "type": "construction",
                "agent_count": 1,
                "task_type": "construction",
                "difficulty_metrics": {
                    "blueprint_size": 25,
                    "required_blocks": 15
                }
            }
        }

        # Create folder structure: model/task_id/
        model_dir = os.path.join(self.exp_dir, "claude-3-5-sonnet-latest")
        os.makedirs(model_dir, exist_ok=True)
        
        task_folders = []

        # Successful cooking task (legacy: both agents succeed)
        cooking_dir = os.path.join(model_dir, "multiagent_cooking_1_cooked_chicken_1_golden_carrot")
        os.makedirs(cooking_dir, exist_ok=True)
        task_folders.append(cooking_dir)
        
        for i in range(2):
            agent_log = [
                {"role": "user", "content": "Starting cooking task"},
                {"role": "assistant", "content": "I will cook the required items"},
                {"role": "system", "content": "Task ended with score : 1"}
            ]
            with open(os.path.join(cooking_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)

        # Failed crafting task (legacy: one agent fails, one succeeds - overall should be success)
        crafting_dir = os.path.join(model_dir, "multiagent_crafting_1_wooden_sword")
        os.makedirs(crafting_dir, exist_ok=True)
        task_folders.append(crafting_dir)
        
        # Agent 0: Success
        agent_log = [
            {"role": "system", "content": "Task ended with score : 1"}
        ]
        with open(os.path.join(crafting_dir, "agent_0.json"), "w") as f:
            json.dump(agent_log, f)
            
        # Agent 1: Failure
        agent_log = [
            {"role": "system", "content": "Task ended with score : 0"}
        ]
        with open(os.path.join(crafting_dir, "agent_1.json"), "w") as f:
            json.dump(agent_log, f)

        # Construction task with partial score (legacy: should be partial success)
        construction_dir = os.path.join(model_dir, "construction_small_house")
        os.makedirs(construction_dir, exist_ok=True)
        task_folders.append(construction_dir)
        
        agent_log = [
            {"role": "system", "content": "Task ended with score : 0.6"}
        ]
        with open(os.path.join(construction_dir, "agent_0.json"), "w") as f:
            json.dump(agent_log, f)

        return task_folders, task_definitions

    def test_success_rate_calculation_compatibility(self):
        """
        Tests that the success rate calculation aligns with legacy expectations,
        where any agent scoring 1.0 marks the task as successful.
        """
        task_folders, task_definitions = self.create_legacy_compatible_data()
        
        # Run new system
        results_df = aggregate_results(task_folders, task_definitions)
        
        # Legacy expectations:
        # - Cooking: SUCCESS (both agents scored 1.0)
        # - Crafting: SUCCESS (any agent scored 1.0)
        # - Construction: FAILED (score < 1.0, but > 0)
        
        cooking_result = results_df[results_df['task_id'].str.contains('cooking')].iloc[0]
        self.assertTrue(cooking_result['overall_is_successful'])
        self.assertEqual(cooking_result['overall_raw_score'], 1.0)
        
        crafting_result = results_df[results_df['task_id'].str.contains('crafting')].iloc[0]
        self.assertTrue(crafting_result['overall_is_successful'])  # Any agent success = overall success
        self.assertEqual(crafting_result['overall_raw_score'], 1.0)
        
        construction_result = results_df[results_df['task_id'].str.contains('construction')].iloc[0]
        self.assertFalse(construction_result['overall_is_successful'])  # < 1.0 = not successful
        self.assertEqual(construction_result['overall_raw_score'], 0.6)

    def test_agent_count_flexibility(self):
        """
        Tests that the system correctly handles tasks with a variable number of
        agents, a scenario the legacy system may have handled rigidly.
        """
        task_definitions = {
            "single_agent_task": {
                "task_id": "single_agent_task",
                "type": "crafting",
                "agent_count": 1,
                "task_type": "crafting"
            },
            "triple_agent_task": {
                "task_id": "triple_agent_task", 
                "type": "cooking",
                "agent_count": 3,
                "task_type": "cooking"
            },
            "five_agent_task": {
                "task_id": "five_agent_task",
                "type": "construction", 
                "agent_count": 5,
                "task_type": "construction"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        os.makedirs(model_dir, exist_ok=True)
        
        task_folders = []

        # Single agent task
        single_dir = os.path.join(model_dir, "single_agent_task")
        os.makedirs(single_dir, exist_ok=True)
        task_folders.append(single_dir)
        
        agent_log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(single_dir, "agent_0.json"), "w") as f:
            json.dump(agent_log, f)

        # Triple agent task 
        triple_dir = os.path.join(model_dir, "triple_agent_task")
        os.makedirs(triple_dir, exist_ok=True)
        task_folders.append(triple_dir)
        
        for i in range(3):
            agent_log = [{"role": "system", "content": f"Task ended with score : {0.5 if i == 0 else 1}"}]
            with open(os.path.join(triple_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)

        # Five agent task
        five_dir = os.path.join(model_dir, "five_agent_task")
        os.makedirs(five_dir, exist_ok=True)
        task_folders.append(five_dir)
        
        for i in range(5):
            agent_log = [{"role": "system", "content": f"Task ended with score : {0 if i < 2 else 0.8}"}]
            with open(os.path.join(five_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)

        # Test that new system handles all agent counts without errors
        results_df = aggregate_results(task_folders, task_definitions)
        
        self.assertEqual(len(results_df), 3)
        
        # Verify agent counts are correct
        single_result = results_df[results_df['task_id'] == 'single_agent_task'].iloc[0]
        self.assertEqual(single_result['total_agent_logs_found'], 1)
        self.assertTrue(single_result['overall_is_successful'])
        
        triple_result = results_df[results_df['task_id'] == 'triple_agent_task'].iloc[0] 
        self.assertEqual(triple_result['total_agent_logs_found'], 3)
        self.assertTrue(triple_result['overall_is_successful'])  # Any agent succeeded
        
        five_result = results_df[results_df['task_id'] == 'five_agent_task'].iloc[0]
        self.assertEqual(five_result['total_agent_logs_found'], 5)
        self.assertFalse(five_result['overall_is_successful'])  # Max score 0.8 < 1.0

    def test_timeout_handling_consistency(self):
        """
        Tests that timeout messages are handled consistently and that a timeout
        in any agent log correctly marks the entire task as timed out.
        """
        task_definitions = {
            "timeout_task": {
                "task_id": "timeout_task",
                "type": "cooking",
                "agent_count": 2,
                "task_type": "cooking"
            },
            "mixed_timeout_task": {
                "task_id": "mixed_timeout_task",
                "type": "crafting",
                "agent_count": 2, 
                "task_type": "crafting"
            }
        }

        model_dir = os.path.join(self.exp_dir, "timeout_model")
        os.makedirs(model_dir, exist_ok=True)
        
        # Pure timeout task
        timeout_dir = os.path.join(model_dir, "timeout_task")
        os.makedirs(timeout_dir, exist_ok=True)
        
        for i in range(2):
            agent_log = [
                {"role": "user", "content": "Starting task"},
                {"role": "system", "content": "Task timeout reached"}
            ]
            with open(os.path.join(timeout_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)

        # Mixed: one timeout, one success
        mixed_dir = os.path.join(model_dir, "mixed_timeout_task")
        os.makedirs(mixed_dir, exist_ok=True)
        
        # Agent 0: timeout
        agent_log = [{"role": "system", "content": "Task timeout reached"}]
        with open(os.path.join(mixed_dir, "agent_0.json"), "w") as f:
            json.dump(agent_log, f)
            
        # Agent 1: success
        agent_log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(mixed_dir, "agent_1.json"), "w") as f:
            json.dump(agent_log, f)

        task_folders = [timeout_dir, mixed_dir]
        results_df = aggregate_results(task_folders, task_definitions)
        
        # Pure timeout should be TIMED_OUT
        timeout_result = results_df[results_df['task_id'] == 'timeout_task'].iloc[0]
        self.assertEqual(timeout_result['overall_completion_status'], CompletionStatus.TIMED_OUT)
        self.assertFalse(timeout_result['overall_is_successful'])
        
        # Mixed should prioritize timeout over success (as per architecture)
        mixed_result = results_df[results_df['task_id'] == 'mixed_timeout_task'].iloc[0]
        self.assertEqual(mixed_result['overall_completion_status'], CompletionStatus.TIMED_OUT)
        self.assertFalse(mixed_result['overall_is_successful'])

    def test_dataframe_output_format_compatibility(self):
        """
        Tests that the output DataFrame contains all the essential columns with
        the correct data types, ensuring compatibility with downstream analysis tools.
        """
        task_folders, task_definitions = self.create_legacy_compatible_data()
        results_df = aggregate_results(task_folders, task_definitions)
        
        # Essential columns that downstream tools expect
        expected_columns = [
            'task_id',
            'model_name',
            'agent_count', 
            'task_type',
            'overall_raw_score',
            'overall_is_successful',
            'overall_completion_status',
            'total_agent_logs_found'
        ]
        
        for col in expected_columns:
            self.assertIn(col, results_df.columns, f"Missing expected column: {col}")
        
        # Check data types are appropriate
        self.assertTrue(results_df['overall_raw_score'].dtype in ['float64', 'float32'])
        self.assertTrue(results_df['overall_is_successful'].dtype == 'bool')
        self.assertTrue(results_df['agent_count'].dtype in ['int64', 'int32'])
        
        # Check for any NaN values in critical columns
        critical_columns = ['task_id', 'overall_raw_score', 'overall_is_successful']
        for col in critical_columns:
            self.assertFalse(results_df[col].isna().any(), f"Found NaN values in {col}")

    def test_score_aggregation_logic_consistency(self):
        """
        Tests that the overall task score is correctly aggregated as the maximum
        score achieved by any single agent in the task.
        """
        task_definitions = {
            "max_score_test": {
                "task_id": "max_score_test",
                "type": "cooking",
                "agent_count": 3,
                "task_type": "cooking"
            }
        }

        model_dir = os.path.join(self.exp_dir, "score_test")
        os.makedirs(model_dir, exist_ok=True)
        
        # Test that max score is taken across agents
        test_dir = os.path.join(model_dir, "max_score_test")
        os.makedirs(test_dir, exist_ok=True)
        
        scores = [0.3, 0.8, 0.5]
        for i, score in enumerate(scores):
            agent_log = [{"role": "system", "content": f"Task ended with score : {score}"}]
            with open(os.path.join(test_dir, f"agent_{i}.json"), "w") as f:
                json.dump(agent_log, f)

        results_df = aggregate_results([test_dir], task_definitions)
        result = results_df.iloc[0]
        
        # Should take maximum score (0.8)
        self.assertEqual(result['overall_raw_score'], 0.8)
        self.assertFalse(result['overall_is_successful'])  # < 1.0
        self.assertEqual(result['overall_completion_status'], CompletionStatus.FAILED_PARTIAL_SCORE)


if __name__ == '__main__':
    unittest.main()