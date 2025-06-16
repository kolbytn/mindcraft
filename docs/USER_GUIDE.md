# Mindcraft Evaluation System - User Guide

This guide provides instructions on how to use the updated evaluation system for Mindcraft tasks.

## Running an Evaluation with `evaluation_script.py`

The [`evaluation_script.py`](../tasks/evaluation_script.py:1) is the primary script for running task evaluations. It launches the necessary Minecraft servers and agents to perform the tasks defined in a given task file.

### Key Features

*   **Parallel Execution**: Run multiple experiments in parallel to speed up evaluation.
*   **Flexible Configuration**: Easily configure agent models, APIs, and other parameters through command-line arguments.
*   **Automatic Results Aggregation**: The script continuously monitors and aggregates results as experiments run.

### Usage

The script is run from the command line:

```bash
python tasks/evaluation_script.py [OPTIONS]
```

### Common Arguments

*   `--task_path`: Path to the JSON file containing task definitions (e.g., `tasks/multiagent_crafting_tasks.json`).
*   `--num_agents`: The number of agents to use for each task.
*   `--num_exp`: The number of times to repeat each task.
*   `--num_parallel`: The number of parallel servers to run for the evaluation.
*   `--exp_name`: A descriptive name for your experiment run.
*   `--model`: The model to use for the agents (e.g., `gpt-4o-mini`).
*   `--api`: The API to use (e.g., `openai`).
*   `--check`: Path to an existing experiment folder to re-evaluate results without running new experiments.

### Example

To run an experiment named `crafting_test` with 2 agents on the crafting tasks, using 4 parallel servers:

```bash
python tasks/evaluation_script.py \
    --task_path tasks/multiagent_crafting_tasks.json \
    --exp_name crafting_test \
    --num_agents 2 \
    --num_parallel 4
```

## Analyzing Results with `analyse_results.py`

Once an experiment is complete, you can use [`analyse_results.py`](../tasks/analyse_results.py:1) to perform a detailed analysis of the results.

### Features

*   **S3 Integration**: Download experiment results directly from an S3 bucket.
*   **Local Analysis**: Analyze results from a local directory.
*   **Detailed Reports**: Generates a CSV file with detailed metrics for each task run.

### Usage

```bash
python tasks/analyse_results.py [OPTIONS]
```

### Arguments

*   `--local_dir`: The local directory containing the experiment folders to analyze.
*   `--task_file_path`: Path to the original task definition file used for the experiment.
*   `--s3_download`: A flag to enable downloading results from S3.
*   `--aws_bucket_name`: The name of the S3 bucket.
*   `--s3_folder_prefix`: The folder prefix in the S3 bucket where results are stored.

### Example

To analyze the results from a local experiment folder:

```bash
python tasks/analyse_results.py \
    --local_dir experiments/crafting_test_06-15_21-38 \
    --task_file_path tasks/multiagent_crafting_tasks.json
```

## Understanding the Rich Output Format

The evaluation system produces two main output files in your experiment folder:

1.  `results.json`: A high-level summary of the experiment.
2.  `detailed_results.csv`: A detailed, row-per-task breakdown of the results.

### Key Columns in `detailed_results.csv`

*   **`task_id`**: The unique identifier for the task.
*   **`overall_is_successful`**: A boolean (`True`/`False`) indicating if the task was completed successfully.
*   **`overall_completion_status`**: A more granular status of the task outcome. See [`CompletionStatus`](../tasks/evaluation.py:11) for possible values:
    *   `SUCCESS`: The task was completed successfully.
    *   `FAILED_SCORE_ZERO`: The task failed with a score of 0.
    *   `FAILED_PARTIAL_SCORE`: The task failed but achieved a partial score.
    *   `TIMED_OUT`: The task failed due to a timeout.
    *   `NO_SCORE_LOGGED`: No score was recorded for the task.
    *   `LOG_FILE_ERROR`: An error occurred while processing the agent's log file.
*   **`overall_raw_score`**: The highest score achieved by any agent for the task.
*   **`metric_*`**: A set of columns prefixed with `metric_` that contain difficulty metrics from the task definition file.

## Migration Guide

Migrating from the old evaluation system to the new one is straightforward:

1.  **Use the new scripts**: Use [`evaluation_script.py`](../tasks/evaluation_script.py:1) to run experiments and [`analyse_results.py`](../tasks/analyse_results.py:1) for analysis.
2.  **Familiarize yourself with the new output**: The primary output is now the `detailed_results.csv` file. The analysis logic that was previously scattered in various scripts is now centralized and produces this single, comprehensive report.
3.  **Leverage the new features**: Take advantage of parallel execution and simplified configuration to run your evaluations more efficiently.