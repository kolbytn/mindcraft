import boto3
import os
import json
import re
from botocore.exceptions import ClientError
import json
import argparse
from tqdm import tqdm
import glob


def analyze_json_file(file_path):
    """
    Analyzes a single JSON file to extract the task outcome.

    Args:
        file_path (str): Path to the JSON file.

    Returns:
        str or None: The task outcome string if found, otherwise None.
    """
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            if 'turns' in data and isinstance(data['turns'], list):
                for turn in reversed(data['turns']):  # Check turns from the end
                    if turn.get('role') == 'system' and isinstance(turn.get('content'), str):
                        if "Task successful ended with code : 2" in turn['content'] or "Task ended in score: 1" in turn["content"]:
                            return True
        return False
    except FileNotFoundError:
        print(f"Error: File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in: {file_path}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while processing {file_path}: {e}")
        return None