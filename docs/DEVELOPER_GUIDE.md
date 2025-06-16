# Mindcraft Evaluation System - Developer Guide

This guide provides technical documentation for developers working with the Mindcraft evaluation system.

## Architecture Overview

The new evaluation module is designed to be modular and extensible. The core components are:

*   **`evaluation_script.py`**: The main entry point for running experiments. It handles setting up the environment, launching servers and agents, and collecting results.
*   **`evaluation.py`**: This module contains the core logic for analyzing and evaluating task outcomes. It defines the data structures for representing results and provides functions for extracting and aggregating them.
*   **`analyse_results.py`**: A script for post-experiment analysis. It can download results from S3, process them using the `evaluation.py` module, and generate detailed reports.

The data flow is as follows:

1.  [`evaluation_script.py`](../tasks/evaluation_script.py:1) runs the experiments and generates raw JSON log files for each agent in an experiment folder.
2.  During or after the experiment, [`evaluation_script.py`](../tasks/evaluation_script.py:1) or [`analyse_results.py`](../tasks/analyse_results.py:1) is used to process these logs.
3.  For each task folder, [`extract_task_outcome()`](../tasks/evaluation.py:113) is called.
4.  [`extract_task_outcome()`](../tasks/evaluation.py:113) calls [`analyze_agent_log()`](../tasks/evaluation.py:47) for each agent's log file to get an [`AgentOutcome`](../tasks/evaluation.py:21).
5.  The individual [`AgentOutcome`](../tasks/evaluation.py:21) objects are aggregated into a single [`TaskRunOutcome`](../tasks/evaluation.py:31).
6.  Finally, all [`TaskRunOutcome`](../tasks/evaluation.py:31) objects are converted into a Pandas DataFrame by [`aggregate_results_to_dataframe()`](../tasks/evaluation.py:170) for easy analysis and reporting.

## API Documentation for `tasks/evaluation.py`

The [`tasks/evaluation.py`](../tasks/evaluation.py:1) module provides the core functions for evaluating task results.

### `analyze_agent_log(file_path: str) -> AgentOutcome`

*   **Description**: Analyzes a single agent's JSON log file. It extracts the score, timeout status, and final system message.
*   **Arguments**:
    *   `file_path` (str): The path to the agent's log file.
*   **Returns**: An [`AgentOutcome`](#agentoutcome) data class containing the results for a single agent.

### `extract_task_outcome(folder_path: str, task_definition: Dict[str, Any]) -> TaskRunOutcome`

*   **Description**: Orchestrates the analysis of a single task run folder. It finds all agent logs, calls `analyze_agent_log` for each, and aggregates the results.
*   **Arguments**:
    *   `folder_path` (str): The path to the folder containing the agent logs for a single task run.
    *   `task_definition` (dict): The definition of the task, used to enrich the results with metadata.
*   **Returns**: A [`TaskRunOutcome`](#taskrunoutcome) data class containing the aggregated results for the task run.

### `aggregate_results_to_dataframe(task_outcomes: List[TaskRunOutcome]) -> pd.DataFrame`

*   **Description**: Converts a list of `TaskRunOutcome` objects into a Pandas DataFrame, which is used for all further analysis and reporting.
*   **Arguments**:
    *   `task_outcomes` (list): A list of `TaskRunOutcome` objects.
*   **Returns**: A `pd.DataFrame` with the flattened and aggregated results.

## Data Structure Specifications

The evaluation system uses two primary data classes to structure the results:

### `AgentOutcome`

Defined in [`tasks/evaluation.py`](../tasks/evaluation.py:21), this data class holds the results for a single agent's participation in a task.

| Field                 | Type                     | Description                                            |
| --------------------- | ------------------------ | ------------------------------------------------------ |
| `raw_score`           | `float`                  | The numerical score achieved by the agent.             |
| `completion_status`   | [`CompletionStatus`](#completionstatus) | The granular status of the agent's task attempt.       |
| `final_system_message`| `str`                    | The final system message from the log.                 |
| `agent_log_processed` | `bool`                   | Whether the agent's log was successfully processed.    |
| `parsing_errors`      | `List[str]`              | A list of any errors encountered during parsing.       |
| `timed_out`           | `bool`                   | `True` if the agent timed out.                         |

### `TaskRunOutcome`

Defined in [`tasks/evaluation.py`](../tasks/evaluation.py:31), this data class aggregates the outcomes from all agents involved in a single task run.

| Field                         | Type                  | Description                                                  |
| ----------------------------- | --------------------- | ------------------------------------------------------------ |
| `task_id`                     | `str`                 | The unique identifier for the task.                          |
| `model_name`                  | `str`                 | The name of the model used.                                  |
| `agent_count`                 | `int`                 | The number of agents that participated in the task.          |
| `task_type`                   | `str`                 | The type of the task (e.g., `cooking`, `crafting`).          |
| `overall_raw_score`           | `float`               | The highest score achieved among all agents.                 |
| `overall_is_successful`       | `bool`                | `True` if the task was successfully completed by any agent.  |
| `overall_completion_status`   | [`CompletionStatus`](#completionstatus) | The aggregated completion status for the entire task.      |
| `total_agent_logs_found`      | `int`                 | The number of agent log files found and processed.           |
| `agent_outcomes`              | `List[AgentOutcome]`  | A list of `AgentOutcome` objects for each agent.             |
| `task_definition_metrics`     | `Dict[str, Any]`      | A dictionary of metrics from the task definition file.       |

### `CompletionStatus`

This `Enum`, defined in [`tasks/evaluation.py`](../tasks/evaluation.py:11), provides a standardized set of outcomes for a task.

*   `SUCCESS`
*   `FAILED_SCORE_ZERO`
*   `FAILED_PARTIAL_SCORE`
*   `TIMED_OUT`
*   `NO_SCORE_LOGGED`
*   `LOG_FILE_ERROR`

## Extension Points for Custom Analysis

The new system is designed to be easily extended. The primary extension point is the final DataFrame generated by [`aggregate_results_to_dataframe()`](../tasks/evaluation.py:170).

Since all the detailed results are available in a structured DataFrame, you can easily perform custom analysis using the full power of the Pandas library. You can write your own scripts to:

*   Load the `detailed_results.csv` file.
*   Perform custom aggregations, filtering, and statistical analysis.
*   Generate new plots and visualizations.
*   Correlate evaluation results with other data sources.