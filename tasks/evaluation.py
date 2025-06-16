import os
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Any
import pandas as pd
import logging

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class CompletionStatus(Enum):
    """Enumeration for the completion status of a task."""
    SUCCESS = "SUCCESS"
    FAILED_SCORE_ZERO = "FAILED_SCORE_ZERO"
    FAILED_PARTIAL_SCORE = "FAILED_PARTIAL_SCORE"
    TIMED_OUT = "TIMED_OUT"
    NO_SCORE_LOGGED = "NO_SCORE_LOGGED"
    LOG_FILE_ERROR = "LOG_FILE_ERROR"

@dataclass
class AgentOutcome:
    """
    Holds the outcome of a single agent's task, including score and status.
    
    Attributes:
        raw_score (float): The score extracted from the log file.
        completion_status (CompletionStatus): The final status of the agent's task.
        final_system_message (str): The last system message, often containing the score.
        agent_log_processed (bool): True if the log was successfully processed.
        parsing_errors (List[str]): A list of errors encountered during parsing.
        timed_out (bool): True if the agent timed out.
    """
    raw_score: float
    completion_status: CompletionStatus
    final_system_message: str
    agent_log_processed: bool
    parsing_errors: List[str] = field(default_factory=list)
    timed_out: bool = False

@dataclass
class TaskRunOutcome:
    """
    Holds the aggregated outcome of a single task run, including all agents.
    
    Attributes:
        task_id (str): The unique identifier for the task.
        model_name (str): The name of the model used for the task.
        agent_count (int): The number of agents participating in the task.
        task_type (str): The category of the task (e.g., 'cooking', 'crafting').
        overall_raw_score (float): The highest score achieved by any agent.
        overall_is_successful (bool): True if the task was completed successfully.
        overall_completion_status (CompletionStatus): The final aggregated status of the task.
        total_agent_logs_found (int): The number of agent log files found.
        agent_outcomes (List[AgentOutcome]): A list of individual agent outcomes.
        task_definition_metrics (Dict[str, Any]): Metrics from the task definition file.
    """
    task_id: str
    model_name: str
    agent_count: int
    task_type: str
    overall_raw_score: float
    overall_is_successful: bool
    overall_completion_status: CompletionStatus
    total_agent_logs_found: int
    agent_outcomes: List[AgentOutcome]
    task_definition_metrics: Dict[str, Any]

import json
import re

def analyze_agent_log(file_path: str) -> AgentOutcome:
    """
    Analyzes a single agent's JSON log file to extract key outcomes.

    This function reads a JSON log file, parses its content to find the final
    score, timeout status, and other relevant information. It is designed to be
    robust against file I/O errors and malformed JSON.

    Args:
        file_path (str): The full path to the agent's log file.

    Returns:
        AgentOutcome: A dataclass containing the analysis results for one agent.
    """
    try:
        with open(file_path, 'r') as f:
            log_data = json.load(f)
    except FileNotFoundError:
        logging.warning(f"Log file not found: {file_path}")
        return AgentOutcome(
            raw_score=0.0,
            completion_status=CompletionStatus.LOG_FILE_ERROR,
            final_system_message="",
            agent_log_processed=False,
            parsing_errors=["FileNotFoundError"],
        )
    except json.JSONDecodeError as e:
        logging.error(f"JSON decoding error in {file_path}: {e}")
        return AgentOutcome(
            raw_score=0.0,
            completion_status=CompletionStatus.LOG_FILE_ERROR,
            final_system_message="",
            agent_log_processed=False,
            parsing_errors=[f"JSONDecodeError: {e}"],
        )

    timed_out = False
    final_system_message = ""
    raw_score = 0.0
    completion_status = CompletionStatus.NO_SCORE_LOGGED

    for entry in reversed(log_data):
        if entry.get("role") == "system":
            content = entry.get("content", "")
            if "Task timeout reached" in content:
                timed_out = True
                final_system_message = content
                completion_status = CompletionStatus.TIMED_OUT
                break
            
            score_match = re.search(r"Task ended with score : (\d+\.?\d*)", content)
            if score_match:
                raw_score = float(score_match.group(1))
                final_system_message = content
                if raw_score == 1.0:
                    completion_status = CompletionStatus.SUCCESS
                elif raw_score == 0.0:
                    completion_status = CompletionStatus.FAILED_SCORE_ZERO
                else:
                    completion_status = CompletionStatus.FAILED_PARTIAL_SCORE
                break

    return AgentOutcome(
        raw_score=raw_score,
        completion_status=completion_status,
        final_system_message=final_system_message,
        agent_log_processed=True,
        timed_out=timed_out,
    )

import glob

def extract_task_outcome(folder_path: str, task_definition: Dict[str, Any]) -> TaskRunOutcome:
    """
    Orchestrates the analysis of a single task run folder by aggregating agent logs.

    This function scans a given folder for agent log files (*.json), analyzes each
    one, and then aggregates the results into a single `TaskRunOutcome`. It determines
    the overall success and status based on the collective performance of all agents.

    Args:
        folder_path (str): The path to the folder containing agent logs for a single run.
        task_definition (Dict[str, Any]): The task definition dictionary, used for metadata.

    Returns:
        TaskRunOutcome: A dataclass containing the aggregated results for the task run.
    """
    agent_log_files = glob.glob(os.path.join(folder_path, "*.json"))
    agent_outcomes = [analyze_agent_log(log_file) for log_file in agent_log_files]

    if not agent_outcomes:
        logging.warning(f"No agent logs found in {folder_path} for task {task_definition.get('task_id', '')}")
        return TaskRunOutcome(
            task_id=task_definition.get("task_id", ""),
            model_name="", # Will be populated later
            agent_count=task_definition.get("agent_count", 0),
            task_type=task_definition.get("task_type", ""),
            overall_raw_score=0.0,
            overall_is_successful=False,
            overall_completion_status=CompletionStatus.NO_SCORE_LOGGED,
            total_agent_logs_found=0,
            agent_outcomes=[],
            task_definition_metrics=task_definition.get("difficulty_metrics", {}),
        )

    overall_raw_score = max(outcome.raw_score for outcome in agent_outcomes)
    
    # If any agent timed out, the whole task is considered timed out.
    if any(outcome.timed_out for outcome in agent_outcomes):
        overall_completion_status = CompletionStatus.TIMED_OUT
    # If any agent succeeded, the task is a success.
    elif any(outcome.completion_status == CompletionStatus.SUCCESS for outcome in agent_outcomes):
        overall_completion_status = CompletionStatus.SUCCESS
    # If all agents have partial scores, the task is partially successful
    elif all(outcome.completion_status == CompletionStatus.FAILED_PARTIAL_SCORE for outcome in agent_outcomes):
        overall_completion_status = CompletionStatus.FAILED_PARTIAL_SCORE
    else:
        # Fallback to the status of the first agent if no clear success/timeout
        overall_completion_status = agent_outcomes[0].completion_status

    overall_is_successful = overall_completion_status == CompletionStatus.SUCCESS

    return TaskRunOutcome(
        task_id=task_definition.get("task_id", ""),
        model_name="", # Will be populated later
        agent_count=task_definition.get("agent_count", 0),
        task_type=task_definition.get("task_type", ""),
        overall_raw_score=overall_raw_score,
        overall_is_successful=overall_is_successful,
        overall_completion_status=overall_completion_status,
        total_agent_logs_found=len(agent_outcomes),
        agent_outcomes=agent_outcomes,
        task_definition_metrics=task_definition.get("difficulty_metrics", {}),
    )

def aggregate_results_to_dataframe(task_outcomes: List[TaskRunOutcome]) -> pd.DataFrame:
    """
    Converts a list of TaskRunOutcome objects into a Pandas DataFrame.

    This function is a key step in the analysis pipeline, transforming the raw
    outcome objects into a structured DataFrame suitable for advanced analysis,
    visualization, and reporting. It flattens nested metric dictionaries for
    easier access.

    Args:
        task_outcomes (List[TaskRunOutcome]): A list of task outcome objects to be aggregated.

    Returns:
        pd.DataFrame: A DataFrame where each row represents a single task run.
    """
    if not task_outcomes:
        return pd.DataFrame()

    # Convert list of dataclasses to list of dicts
    outcome_dicts = [vars(outcome) for outcome in task_outcomes]
    
    # Create DataFrame
    df = pd.DataFrame(outcome_dicts)
    
    # Flatten the 'task_definition_metrics' dictionary into separate columns
    if 'task_definition_metrics' in df.columns:
        metrics_df = df['task_definition_metrics'].apply(pd.Series)
        metrics_df = metrics_df.add_prefix('metric_')
        df = pd.concat([df.drop(['task_definition_metrics'], axis=1), metrics_df], axis=1)

    # The 'agent_outcomes' is a complex object (list of dataclasses).
    # For now, we'll leave it as is, but it can be flattened further if needed.
    
    return df