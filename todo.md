# Mindcraft Analysis Improvement: Granular Task Outcome Reporting

## 🐛 Issue: Inconsistent and Limited Task Evaluation

The current Python analysis scripts (`tasks/evaluation_script.py`, `tasks/analyse_results.py`) suffer from two main limitations:

1.  **Hardcoded Agent Count Assumption:** The `extract_result` function explicitly asserts `len(json_files) == 2`, causing failures when evaluating single-agent tasks or tasks with more than two agents.
2.  **Insufficient Outcome Granularity:** The extracted "success" is often a simple boolean (0 or 1) or a direct score. This fails to capture crucial details like timeouts, partial progress, or specific error states, which are vital for deeper performance analysis and debugging.

## 🛠️ Immediate Fix: Decouple Agent Count from Log Extraction

The first step is to remove the brittle assumption about the number of agent log files.

**Proposed Change:**
*   **In `tasks/evaluation_script.py` (and `tasks/analyse_results.py`):**
    *   Modify the `extract_result(folder_path)` function:
        *   Remove the line `assert len(json_files) == 2`.
        *   Change the logic to iterate through *all* `*.json` files found within `folder_path`.
        *   For each `json_file`, call `analyze_json_file()` (or its equivalent in `analyse_results.py`).
        *   The task is considered successful if *any* of the agent logs within that folder indicates a successful outcome (`Task ended with score : 1` for binary, `>0` for construction).
    *   This ensures the script runs without crashing for any number of agents.

## ✨ Improvement: Comprehensive Task Outcome Data

Beyond the immediate fix, enhance the analysis by generating a rich, standardized outcome dictionary for each task run. This provides nuanced insights into task completion status, even in failure scenarios.

**Core Idea:**
Transform the output of the per-task analysis from a simple boolean/score to a structured dictionary containing all relevant details about the task execution and its outcome.

**Detailed Steps:**

1.  **Refine `analyze_json_file(file_path)`:**
    *   **Purpose:** This function will become responsible for extracting the detailed outcome from a *single agent's log file*.
    *   **New Output (for a single agent log):**
        ```python
        {
            "raw_score": 1.0,         # Numeric score (1, 0, or 0.XX for construction)
            "completion_status": "SUCCESS", # Enum: "SUCCESS", "FAILED_SCORE_ZERO", "FAILED_PARTIAL_SCORE", "TIMED_OUT", "NO_SCORE_LOGGED", "LOG_FILE_ERROR"
            "final_system_message": "Task ended with score : 1", # The exact system message found
            "agent_log_processed": True, # Indicates if the file was parsed successfully
            "parsing_errors": [],     # List of any specific parsing errors within this log file
            # ... potentially other agent-specific metrics like message counts, command counts etc.
        }
        ```
    *   **Logic Changes:**
        *   Scan system messages for "Task ended with score : X" to get `raw_score`.
        *   Check for "Task timeout reached" message to set `completion_status` to `"TIMED_OUT"`, overriding other statuses if present.
        *   Categorize scores (e.g., `score == 0` for `"FAILED_SCORE_ZERO"`, `0 < score < 1` for `"FAILED_PARTIAL_SCORE"`).
        *   Handle `FileNotFoundError`, `json.JSONDecodeError`, etc., by setting `agent_log_processed: False` and recording specific `parsing_errors`.

2.  **Overhaul `extract_result(folder_path, task_definition)`:**
    *   **Purpose:** This function will collect individual agent outcomes and combine them into a single, comprehensive outcome dictionary for the *entire task run*.
    *   **New Input:** It will now accept `task_definition` (the parsed JSON entry for this specific task from the main task file, containing `agent_count`, `task_type`, `recipes`, `blueprint`, `difficulty_metrics`, etc.). This eliminates fragile inference from folder names.
    *   **New Output (for an entire task run):**
        ```python
        {
            "task_id": "multiagent_cooking_1_cooked_chicken_1_golden_carrot", # From task_definition
            "model_name": "claude-3-5-sonnet-latest", # (Will be populated by `aggregate_results` later)
            "agent_count": 2,                           # From task_definition
            "task_type": "cooking",                     # From task_definition
            "overall_raw_score": 1.0,                   # The highest/combined score from agent logs
            "overall_is_successful": True,              # Boolean: derived from overall_raw_score
            "overall_completion_status": "SUCCESS",     # Combined status for the task run
            "total_agent_logs_found": 2,                # Count of agent log files found
            "agent_outcomes": [                         # List of dictionaries from `analyze_json_file` for each agent
                # { ... outcome for agent 0 ... },
                # { ... outcome for agent 1 ... }
            ],
            "task_definition_metrics": {                # Relevant metrics copied from the task_definition (e.g., difficulty_metrics, total_recipe_steps)
                "total_recipe_steps": 4,
                "unique_target_items": 2,
                "difficulty_category": "medium"
            }
        }
        ```
    *   **Logic Changes:**
        *   Iterate through all JSON files in `folder_path`, calling `analyze_json_file` for each.
        *   Combine individual `agent_outcomes` to determine `overall_raw_score` and `overall_is_successful`. For instance, for cooking/crafting, if any agent's log indicates success, `overall_raw_score` is 1. For construction, it might be the maximum score among agents.
        *   Determine `overall_completion_status`: If any agent timed out, the whole task timed out. Prioritize "TIMEOUT" over "SUCCESS" if both are indicated (e.g., if a task completes but also times out). Handle cases where all logs have `LOG_FILE_ERROR`.

3.  **Refactor `aggregate_results(local_folders)`:**
    *   **Purpose:** Simplify and empower the main aggregation function.
    *   **Logic Changes:**
        *   Iterate through `local_folders`. For each folder, call the new `extract_result` to get the comprehensive `task_run_outcome` dictionary.
        *   Collect all `task_run_outcome` dictionaries into a master list.
        *   **Leverage Pandas:** Convert this master list of dictionaries into a Pandas DataFrame.
        *   All subsequent aggregations (e.g., "by depth," "by plan availability," "overall success rate") can be performed cleanly and flexibly using Pandas' `groupby()` and aggregation methods on this rich DataFrame.

## 📁 Files Affected

*   `tasks/evaluation_script.py`
*   `tasks/analyse_results.py` (for consistency, as it likely shares similar `extract_result` logic)
*   `tasks/analyze_cooking_tasks.py` (similarly)

This plan moves the evaluation system towards a more robust, data-rich, and extensible state, providing a much clearer picture of agent performance.