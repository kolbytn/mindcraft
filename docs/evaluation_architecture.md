### **Evaluation System Architecture**

This document outlines the architecture for the refactored Mindcraft task evaluation system.

#### **1. Guiding Principles**

*   **Single Responsibility:** Each function and module will have a single, well-defined purpose.
*   **Data-Driven:** Logic will be driven by explicit data from task definitions, not inferred from fragile folder names.
*   **Decoupling:** Data extraction, aggregation, and reporting will be decoupled.
*   **Extensibility:** The system will be easy to extend with new metrics and task types.
*   **Backward Compatibility:** The final success rate calculation will remain consistent with the old method where a score of `1.0` means success.

#### **2. Core Components & Data Flow**

The new system will be centered around a new `evaluation` module, which will house the core logic. Existing scripts will be refactored to use this module.

```mermaid
graph TD
    subgraph "Entrypoints (Existing Scripts)"
        A["evaluation_script.py"]
        B["analyse_results.py"]
        C["analyze_cooking_tasks.py"]
    end

    subgraph "Core Evaluation Module (evaluation.py)"
        D[analyze_agent_log(file_path)]
        E[extract_task_outcome(folder_path, task_definition)]
        F[aggregate_results_to_dataframe(task_outcomes)]
    end

    subgraph "Data Sources"
        G["Agent Log Files (*.json)"]
        H["Task Definition File (e.g., multiagent_crafting_tasks.json)"]
    end

    subgraph "Output"
        I["Pandas DataFrame (Rich Data)"]
        J["Aggregated Reports (e.g., CSV, JSON)"]
    end

    A -- "Calls" --> E
    B -- "Calls" --> F
    C -- "Calls" --> E

    E -- "Iterates over agent logs, calls" --> D
    D -- "Reads" --> G
    E -- "Uses" --> H

    E -- "Returns list of" --> F
    F -- "Generates" --> I
    I -- "Used to create" --> J

```

#### **3. Data Structures**

The new system introduces two primary data structures to provide rich, detailed outcome reporting.

**3.1. Agent Outcome Dictionary**

Returned by `analyze_agent_log()`. Captures the result from a single agent's log file.

```json
{
    "raw_score": 1.0,
    "completion_status": "SUCCESS", 
    "final_system_message": "Task ended with score : 1",
    "agent_log_processed": true,
    "parsing_errors": [],
    "timed_out": false
}
```

*   **`completion_status` (Enum):**
    *   `SUCCESS`: `raw_score` is 1.0.
    *   `FAILED_SCORE_ZERO`: `raw_score` is 0.0.
    *   `FAILED_PARTIAL_SCORE`: `raw_score` is > 0 and < 1 (for construction tasks).
    *   `TIMED_OUT`: "Task timeout reached" message is present.
    *   `NO_SCORE_LOGGED`: No score message was found.
    *   `LOG_FILE_ERROR`: The log file could not be read or parsed.

**3.2. Task Outcome Dictionary**

Returned by `extract_task_outcome()`. Aggregates outcomes from all agents for a single task run. This is the primary unit of data for analysis.

```json
{
    "task_id": "multiagent_cooking_1_cooked_chicken_1_golden_carrot",
    "model_name": "claude-3-5-sonnet-latest",
    "agent_count": 2,
    "task_type": "cooking",
    "overall_raw_score": 1.0,
    "overall_is_successful": true,
    "overall_completion_status": "SUCCESS",
    "total_agent_logs_found": 2,
    "agent_outcomes": [
        { "... Agent 0 Outcome Dictionary ..." },
        { "... Agent 1 Outcome Dictionary ..." }
    ],
    "task_definition_metrics": {
        "total_recipe_steps": 4,
        "unique_target_items": 2
    }
}
```

#### **4. Function Signatures and Responsibilities**

A new file, `tasks/evaluation.py`, will be created to house the core logic.

**File: `tasks/evaluation.py`**

```python
import pandas as pd
from typing import List, Dict, Any

def analyze_agent_log(file_path: str) -> Dict[str, Any]:
    """
    Analyzes a single agent's JSON log file.
    - Extracts raw_score, final_system_message, and timeout status.
    - Determines a detailed `completion_status`.
    - Handles file I/O and JSON parsing errors gracefully.
    - Returns an Agent Outcome Dictionary.
    """
    # Implementation as described in todo.md
    pass

def extract_task_outcome(folder_path: str, task_definition: Dict[str, Any]) -> Dict[str, Any]:
    """
    Orchestrates the analysis of a single task run folder.
    - Finds all agent logs (*.json) in the folder.
    - Calls analyze_agent_log() for each log.
    - Aggregates agent outcomes to determine overall_raw_score, overall_is_successful, and overall_completion_status.
    - Populates task metadata from the task_definition.
    - Returns a Task Outcome Dictionary.
    """
    # Implementation as described in todo.md
    pass

def aggregate_results_to_dataframe(task_outcomes: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Converts a list of Task Outcome Dictionaries into a Pandas DataFrame.
    - Flattens nested structures for easy analysis.
    - This DataFrame becomes the foundation for all subsequent reporting and analysis.
    """
    # Implementation as described in todo.md
    pass
```

#### **5. Integration and Refactoring Plan**

1.  **Create `tasks/evaluation.py`:** Implement the three functions defined above.
2.  **Refactor `tasks/evaluation_script.py`:**
    *   The `aggregate_results` function will be replaced. Instead, it will loop through experiment folders, load the corresponding `task_definition`, call `evaluation.extract_task_outcome()`, and collect the results.
    *   After the loop, it will call `evaluation.aggregate_results_to_dataframe()` to get the final DataFrame.
    *   All analysis (e.g., calculating overall success rate) will be done using the resulting DataFrame.
3.  **Refactor `tasks/analyse_results.py`:**
    *   It calls the `aggregate_results` function which is an enhanced version of `aggregate_results` from `evaluation.py` that adds model name extraction.
    *   The complex, name-based categorization (`is_base`, `base_without_plan`) will be entirely replaced by simple Pandas `groupby()` operations on the DataFrame's columns (e.g., `df.groupby('task_type').success_rate.mean()`).
4.  **Refactor `tasks/analyze_cooking_tasks.py`:**
    *   This script will also be refactored to use the new `evaluation` module.
    *   Analysis of blocked agents or specific items will be done by filtering the master DataFrame, not with custom parsing logic.

#### **6. Error Handling**

*   **File/JSON Errors:** `analyze_agent_log` will catch `FileNotFoundError` and `json.JSONDecodeError`, returning a `LOG_FILE_ERROR` status so the task run is not silently ignored.
*   **Missing Task Definitions:** The calling script will be responsible for handling cases where a task definition for a given folder cannot be found.
*   **No Logs Found:** `extract_task_outcome` will handle cases where a folder contains no `.json` files, reporting a count of 0 and an appropriate status.

This architecture directly addresses the requirements in `todo.md`, creating a centralized, robust, and extensible system for evaluating agent performance.