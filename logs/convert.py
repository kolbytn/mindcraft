import csv
import json
import logging
import sys
import os
import random
from typing import List, Dict
import pandas as pd
from USERNAMES import Get_Usernames
from transformers import AutoTokenizer
from tqdm import tqdm
import torch
from PIL import Image
import base64
from io import BytesIO

# Try to import pandas-image-methods for vision data handling
try:
    from pandas_image_methods import PILMethods
    PANDAS_IMAGE_METHODS_AVAILABLE = True
    # Enable PIL methods for pandas
    pd.api.extensions.register_series_accessor("pil")(PILMethods)
except ImportError:
    PANDAS_IMAGE_METHODS_AVAILABLE = False
    logging.warning("pandas-image-methods not available. Install with: pip install pandas-image-methods")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Increase CSV field size limit to avoid errors with very large fields.
maxInt = sys.maxsize
while True:
    try:
        csv.field_size_limit(maxInt)
        break
    except OverflowError:
        maxInt = int(maxInt/10)

# Define the original usernames.
ORIGINAL_USERNAMES = [
    "Your_username", "Andy"
]

# Define outputs that should cause the conversation to be deleted.
BAD_OUTPUTS = {
    "My brain just kinda stopped working. Try again.",
    "My brain disconnected, try again.",
    "Vision is only supported",
    "Context length exceeded",
    "Image input modality is not enabled",
    "An unexpected error occurred",
}

MINECRAFT_USERNAMES = list(set(Get_Usernames()))  # Remove duplicates
duplicate_count = len(Get_Usernames()) - len(MINECRAFT_USERNAMES)

available_minecraft_usernames = list(MINECRAFT_USERNAMES)  # Create a copy for tracking

global username_replaced_count
global reasoning_replaced_count
username_replaced_count = 0
reasoning_replaced_count = 0

def replace_reasoning_prompt(text: str) -> str:
    global reasoning_replaced_count
    replaced = False
    # Optionally, replace the reasoning prompt if needed.
    if replaced:
        reasoning_replaced_count += 1
    return text

def parse_json_safely(text: str) -> List[Dict[str, str]]:
    try:
        if text.startswith('[') and '],' in text:
            parts = text.split('],')
            text = parts[0] + ']'
        if text.startswith('"') and text.endswith('"'):
            text = text[1:-1]
            text = text.replace('""', '"')
        data = json.loads(text)
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            data = data[0]
        converted_messages = []
        for msg in data:
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                converted_messages.append({
                    "from": "human" if msg['role'] in ("system", "user") else "gpt",
                    "value": msg['content']
                })
        return converted_messages
    except Exception as e:
        logger.debug(f"Error parsing JSON: {e}")  # Suppressed error level
        return [{
            "from": "human",
            "value": text
        }]

def create_conversation_thread(row: Dict[str, str]) -> List[Dict[str, str]]:
    messages = []
    conversation_replacements = {}  # Track username replacements for this conversation ONLY
    
    def replace_usernames_in_message(text: str) -> str:
        global username_replaced_count
        global available_minecraft_usernames
        replaced = False

        if not MINECRAFT_USERNAMES:
            return text

        for orig_name in ORIGINAL_USERNAMES:
            if orig_name in text:
                if orig_name not in conversation_replacements:
                    # If we've used all available names, reset the list
                    if not available_minecraft_usernames:
                        available_minecraft_usernames = list(MINECRAFT_USERNAMES)
                    # Get a random name from the available ones
                    replacement = random.choice(available_minecraft_usernames)
                    available_minecraft_usernames.remove(replacement)
                    conversation_replacements[orig_name] = replacement
                    replaced = True
                # Use existing replacement for this conversation
                text = text.replace(orig_name, conversation_replacements[orig_name])

        if replaced:
            username_replaced_count += 1
        return text

    if row.get("input"):
        messages = parse_json_safely(str(row["input"]))
        # Apply consistent username replacements to all messages
        for msg in messages:
            msg["value"] = replace_usernames_in_message(msg["value"])
    
    if row.get("output"):
        output_text = str(row["output"]).strip()
        output_text = replace_usernames_in_message(output_text)
        output_text = replace_reasoning_prompt(output_text)
        messages.append({
            "from": "gpt",
            "value": output_text
        })
    
    return messages

def conversation_has_bad_output(messages: List[Dict[str, str]]) -> bool:
    for msg in messages:
        if msg["from"] == "gpt" and msg["value"].strip() in BAD_OUTPUTS:
            return True
    return False

def load_image_from_base64(base64_string: str):
    """Convert base64 string to PIL Image"""
    try:
        if base64_string.startswith('data:'):
            base64_string = base64_string.split(',')[1]
        
        image_bytes = base64.b64decode(base64_string)
        image = Image.open(BytesIO(image_bytes))
        
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
            
        return image
    except Exception as e:
        logger.debug(f"Error loading image from base64: {e}")
        return Image.new('RGB', (224, 224), color='gray')

def pil_image_to_parquet_dict(image: Image.Image, filename: str) -> Dict:
    """Converts a PIL Image to the dictionary format {bytes, path} for Parquet."""
    img_byte_arr = BytesIO()
    # Determine a suitable save format
    save_format = image.format if image.format and image.format in Image.SAVE else 'PNG'
    
    # Handle specific mode conversions if necessary for the chosen format
    if save_format == 'PNG' and image.mode not in ['RGB', 'RGBA', 'L', 'P', 'I', 'F']: # Common PNG modes
        # Convert to a mode PNG supports, e.g., RGBA to preserve transparency
        image_to_save = image.convert("RGBA")
    elif save_format == 'JPEG' and image.mode not in ['RGB', 'L', 'CMYK']:
        # Convert to a mode JPEG supports
        image_to_save = image.convert("RGB")
    else:
        image_to_save = image

    try:
        image_to_save.save(img_byte_arr, format=save_format)
    except Exception as e:
        logger.warning(f"Could not save image {filename} in format {save_format} (Error: {e}). Attempting PNG.")
        save_format = 'PNG'
        if image_to_save.mode not in ['RGB', 'RGBA', 'L', 'P', 'I', 'F']:
            image_to_save = image.convert("RGBA") # Default to RGBA for PNG
        image_to_save.save(img_byte_arr, format=save_format)
        
    return {"bytes": img_byte_arr.getvalue(), "path": filename}

def extract_vision_data_from_jsonl(jsonl_path: str) -> List[Dict]:
    """Extract vision data from HuggingFace JSONL metadata format"""
    if not os.path.isfile(jsonl_path):
        logger.error(f"JSONL file not found: {jsonl_path}")
        return []
    
    logger.info(f"Reading vision metadata: {jsonl_path}")
    
    # Get the directory containing the JSONL file (should contain images folder)
    base_dir = os.path.dirname(jsonl_path)
    images_dir = os.path.join(base_dir, 'images')
    
    if not os.path.isdir(images_dir):
        logger.error(f"Images directory not found: {images_dir}")
        return []
    
    vision_data = []
    
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
                
            try:
                entry = json.loads(line)
                
                # Extract required fields - logger.js uses 'input' and 'response', not 'text'
                file_name = entry.get('file_name', '')
                input_data = entry.get('input', '')
                response = entry.get('response', '')
                
                if not all([file_name, input_data, response]):
                    logger.warning(f"Line {line_num}: Missing required fields (file_name, input, response)")
                    continue
                
                # Check for bad outputs
                if response.strip() in BAD_OUTPUTS:
                    logger.debug(f"Line {line_num}: Skipping bad output")
                    continue
                
                # Load the image
                image_path = os.path.join(base_dir, file_name)
                if not os.path.isfile(image_path):
                    logger.warning(f"Line {line_num}: Image file not found: {image_path}")
                    continue
                
                try:
                    image = Image.open(image_path)
                    if image.mode in ('RGBA', 'LA', 'P') and image.format != 'PNG': # PNG handles these modes well
                        image = image.convert('RGB') # Convert to RGB if not PNG to simplify, or handle more modes in pil_image_to_parquet_dict
                except Exception as e:
                    logger.warning(f"Line {line_num}: Error loading image {image_path}: {e}")
                    continue
                
                # Convert PIL image to parquet-compatible dict
                relative_image_path_for_dict = file_name # Use the relative path from metadata
                image_dict = pil_image_to_parquet_dict(image, relative_image_path_for_dict)

                # Create a separate conversation_replacements for each vision entry
                entry_conversation_replacements = {}
                
                # Replace usernames consistently within this single entry
                def replace_usernames_in_text(text: str) -> str:
                    global username_replaced_count
                    global available_minecraft_usernames
                    replaced = False

                    if not MINECRAFT_USERNAMES:
                        return text

                    for orig_name in ORIGINAL_USERNAMES:
                        if orig_name in text:
                            if orig_name not in entry_conversation_replacements:
                                if not available_minecraft_usernames:
                                    available_minecraft_usernames = list(MINECRAFT_USERNAMES)
                                replacement = random.choice(available_minecraft_usernames)
                                available_minecraft_usernames.remove(replacement)
                                entry_conversation_replacements[orig_name] = replacement
                                replaced = True
                            text = text.replace(orig_name, entry_conversation_replacements[orig_name])

                    if replaced:
                        username_replaced_count += 1
                    return text
                
                # Parse the input data (conversation history) and build conversation
                try:
                    # The input_data should be JSON string of conversation history
                    conversation_history = json.loads(input_data)
                    
                    # Build the conversation in unsloth format
                    conversation = []
                    
                    if isinstance(conversation_history, list):
                        for msg in conversation_history:
                            if isinstance(msg, dict) and 'role' in msg:
                                role = msg['role']
                                # Map system messages to user role for simplicity
                                if role == 'system':
                                    role = 'user'
                                
                                content_parts = []
                                
                                # Handle different content formats
                                if 'content' in msg:
                                    content = msg['content']
                                    if isinstance(content, str):
                                        # Simple string content
                                        text_content = replace_usernames_in_text(content)
                                        content_parts.append({"type": "text", "text": text_content})
                                    elif isinstance(content, list):
                                        # Array content (multimodal messages)
                                        for part in content:
                                            if isinstance(part, dict):
                                                if part.get('type') == 'text':
                                                    text_content = part.get('text', '')
                                                    if text_content:
                                                        text_content = replace_usernames_in_text(text_content)
                                                        content_parts.append({"type": "text", "text": text_content})
                                                # Skip image parts from history - we'll add the main image to the user message
                                elif any(key in msg for key in ['text', 'message', 'value']):
                                    # Handle other message formats
                                    text_content = msg.get('text') or msg.get('message') or msg.get('value', '')
                                    if text_content:
                                        text_content = replace_usernames_in_text(str(text_content))
                                        content_parts.append({"type": "text", "text": text_content})
                                
                                if content_parts:
                                    conversation.append({
                                        "role": role,
                                        "content": content_parts
                                    })
                    
                    # If no conversation history was parsed or it's empty, create a simple user message
                    if not conversation:
                        # Use the raw input data as text
                        text_content = replace_usernames_in_text(str(input_data).strip())
                        conversation.append({
                            "role": "user",
                            "content": [{"type": "text", "text": text_content}]
                        })
                    
                    # Add the image to the last user message (or create one if none exists)
                    user_msg_found = False
                    for i in range(len(conversation) - 1, -1, -1):
                        if conversation[i]["role"] == "user":
                            # Add image to this user message
                            conversation[i]["content"].append({"type": "image", "image": image_dict})
                            user_msg_found = True
                            break
                    
                    if not user_msg_found:
                        # No user message found, create one with just the image
                        conversation.append({
                            "role": "user", 
                            "content": [{"type": "image", "image": image_dict}]
                        })
                    
                    # Add the assistant response
                    response_text = replace_usernames_in_text(response)
                    conversation.append({
                        "role": "assistant",
                        "content": [{"type": "text", "text": response_text}]
                    })
                    
                except json.JSONDecodeError:
                    # If input_data is not valid JSON, create simple conversation
                    text_content = replace_usernames_in_text(str(input_data).strip())
                    response_text = replace_usernames_in_text(response)
                    
                    conversation = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": text_content},
                                {"type": "image", "image": image_dict}
                            ]
                        },
                        {
                            "role": "assistant", 
                            "content": [{"type": "text", "text": response_text}]
                        }
                    ]
                except Exception as e:
                    logger.debug(f"Line {line_num}: Error parsing conversation history: {e}")
                    # Fallback to simple conversation
                    text_content = replace_usernames_in_text(str(input_data).strip())
                    response_text = replace_usernames_in_text(response)
                    
                    conversation = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": text_content},
                                {"type": "image", "image": image_dict}
                            ]
                        },
                        {
                            "role": "assistant",
                            "content": [{"type": "text", "text": response_text}]
                        }
                    ]
                
                vision_data.append(conversation)
                
            except json.JSONDecodeError as e:
                logger.warning(f"Line {line_num}: JSON decode error: {e}")
                continue
            except Exception as e:
                logger.warning(f"Line {line_num}: Unexpected error: {e}")
                continue
    
    logger.info(f"Successfully processed {len(vision_data)} vision entries")
    return vision_data

def extract_vision_conversations_from_csv(csv_input: str) -> List[Dict]:
    """Extract vision data from CSV with input,image,output columns"""
    if not os.path.isfile(csv_input):
        logger.debug(f"Vision CSV file not found: {csv_input}")
        return []
    
    logger.info(f"Reading Vision CSV: {csv_input}")
    
    try:
        df = pd.read_csv(csv_input)
        required_columns = ['input', 'image', 'output']
        
        if not all(col in df.columns for col in required_columns):
            logger.debug(f"Vision CSV missing required columns: {required_columns}")
            return []
        
        vision_data = []
        
        for idx, row in df.iterrows():
            try:
                input_text = str(row['input']).strip()
                image_b64 = str(row['image']).strip()
                output_text = str(row['output']).strip()
                
                if not all([input_text, image_b64, output_text]):
                    continue
                
                # Check for bad outputs
                if output_text in BAD_OUTPUTS:
                    continue
                
                # Create separate replacements for each row
                row_conversation_replacements = {}
                
                # Replace usernames consistently within this single row
                def replace_usernames_in_text(text: str) -> str:
                    global username_replaced_count
                    global available_minecraft_usernames
                    replaced = False

                    if not MINECRAFT_USERNAMES:
                        return text

                    for orig_name in ORIGINAL_USERNAMES:
                        if orig_name in text:
                            if orig_name not in row_conversation_replacements:
                                if not available_minecraft_usernames:
                                    available_minecraft_usernames = list(MINECRAFT_USERNAMES)
                                replacement = random.choice(available_minecraft_usernames)
                                available_minecraft_usernames.remove(replacement)
                                row_conversation_replacements[orig_name] = replacement
                                replaced = True
                            text = text.replace(orig_name, row_conversation_replacements[orig_name])

                    if replaced:
                        username_replaced_count += 1
                    return text
                
                input_text = replace_usernames_in_text(input_text)
                output_text = replace_usernames_in_text(output_text)
                
                # Load image from base64
                image = load_image_from_base64(image_b64)
                
                # Convert PIL image to parquet-compatible dict
                image_filename_for_dict = f"image_from_base64_{idx}.png" # Create a placeholder filename
                image_dict = pil_image_to_parquet_dict(image, image_filename_for_dict)

                # Create conversation in unsloth format
                conversation = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": input_text},
                            {"type": "image", "image": image_dict}
                        ]
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": output_text}]
                    }
                ]
                
                vision_data.append(conversation)
                
            except Exception as e:
                logger.warning(f"Row {idx}: Error processing vision data: {e}")
                continue
        
        logger.info(f"Successfully processed {len(vision_data)} vision entries from CSV")
        return vision_data
        
    except Exception as e:
        logger.error(f"Error reading vision CSV {csv_input}: {e}")
        return []

def extract_conversations_from_csv(csv_input: str) -> List[List[Dict[str, str]]]:
    if not os.path.isfile(csv_input):
        logger.debug(f"CSV file not found: {csv_input}")
        return []
    
    logger.info(f"Reading CSV: {csv_input}")
    valid_rows = []
    extra_issue_rows = 0
    total_extra_columns = 0

    with open(csv_input, newline='', encoding="utf-8") as csvfile:
        reader = csv.reader(csvfile)
        try:
            header = next(reader)
        except StopIteration:
            logger.debug(f"CSV file {csv_input} is empty.")
            return []
        
        header_expected = {"input", "output"}
        header_map = {col: idx for idx, col in enumerate(header)}
        if not header_expected.issubset(set(header)):
            logger.debug(f"CSV header does not contain required columns: {header_expected}")
            return []
        
        for idx, row in enumerate(reader, start=2):
            non_empty_count = sum(1 for field in row if field.strip() != "")
            if non_empty_count > 2:
                extra = non_empty_count - 2
                extra_issue_rows += 1
                total_extra_columns += extra
                logger.info(f"Row {idx} has {extra} extra filled column(s); row skipped.")
                continue
            row_dict = {col: row[header_map[col]] if header_map[col] < len(row) else "" for col in header_expected}
            valid_rows.append(row_dict)
    
    logger.info(f"Excluded {extra_issue_rows} row(s) with extra columns (total extra columns: {total_extra_columns}).")
    df = pd.DataFrame(valid_rows)
    conversations = []
    for idx, row in df.iterrows():
        conv = create_conversation_thread(row)
        if conversation_has_bad_output(conv):
            continue
        conversations.append(conv)
    return conversations

def extract_vision_conversations_from_csv(csv_input: str) -> List[Dict]:
    """Extract vision data from CSV with input,image,output columns"""
    if not os.path.isfile(csv_input):
        logger.debug(f"Vision CSV file not found: {csv_input}")
        return []
    
    logger.info(f"Reading Vision CSV: {csv_input}")
    
    try:
        df = pd.read_csv(csv_input)
        required_columns = ['input', 'image', 'output']
        
        if not all(col in df.columns for col in required_columns):
            logger.debug(f"Vision CSV missing required columns: {required_columns}")
            return []
        
        vision_data = []
        
        for idx, row in df.iterrows():
            try:
                input_text = str(row['input']).strip()
                image_b64 = str(row['image']).strip()
                output_text = str(row['output']).strip()
                
                if not all([input_text, image_b64, output_text]):
                    continue
                
                # Check for bad outputs
                if output_text in BAD_OUTPUTS:
                    continue
                
                # Create separate replacements for each row
                row_conversation_replacements = {}
                
                # Replace usernames consistently within this single row
                def replace_usernames_in_text(text: str) -> str:
                    global username_replaced_count
                    global available_minecraft_usernames
                    replaced = False

                    if not MINECRAFT_USERNAMES:
                        return text

                    for orig_name in ORIGINAL_USERNAMES:
                        if orig_name in text:
                            if orig_name not in row_conversation_replacements:
                                if not available_minecraft_usernames:
                                    available_minecraft_usernames = list(MINECRAFT_USERNAMES)
                                replacement = random.choice(available_minecraft_usernames)
                                available_minecraft_usernames.remove(replacement)
                                row_conversation_replacements[orig_name] = replacement
                                replaced = True
                            text = text.replace(orig_name, row_conversation_replacements[orig_name])

                    if replaced:
                        username_replaced_count += 1
                    return text
                
                input_text = replace_usernames_in_text(input_text)
                output_text = replace_usernames_in_text(output_text)
                
                # Load image from base64
                image = load_image_from_base64(image_b64)
                
                # Convert PIL image to parquet-compatible dict
                image_filename_for_dict = f"image_from_base64_{idx}.png" # Create a placeholder filename
                image_dict = pil_image_to_parquet_dict(image, image_filename_for_dict)

                # Create conversation in unsloth format
                conversation = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": input_text},
                            {"type": "image", "image": image_dict}
                        ]
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": output_text}]
                    }
                ]
                
                vision_data.append(conversation)
                
            except Exception as e:
                logger.warning(f"Row {idx}: Error processing vision data: {e}")
                continue
        
        logger.info(f"Successfully processed {len(vision_data)} vision entries from CSV")
        return vision_data
        
    except Exception as e:
        logger.error(f"Error reading vision CSV {csv_input}: {e}")
        return []

def extract_conversations_from_json(json_input: str) -> List[List[Dict[str, str]]]:
    logger.info(f"Reading JSON: {json_input}")
    try:
        with open(json_input, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.debug(f"Error reading {json_input}: {e}")
        return []
    conversations = []
    for conv in data:
        messages = []
        if "system" in conv and conv["system"]:
            system_text = str(conv["system"]).strip()
            system_text = replace_reasoning_prompt(system_text)
            messages.append({"from": "human", "value": system_text})
        if "user" in conv and conv["user"]:
            user_text = str(conv["user"]).strip()
            user_text = replace_reasoning_prompt(user_text)
            messages.append({"from": "human", "value": user_text})
        if "assistant" in conv and conv["assistant"]:
            assistant_text = str(conv["assistant"]).strip()
            assistant_text = replace_reasoning_prompt(assistant_text)
            messages.append({"from": "gpt", "value": assistant_text})
        if messages and not conversation_has_bad_output(messages):
            conversations.append(messages)
    return conversations

if __name__ == "__main__":
    # Handle vision dataset processing
    if '--vision' in sys.argv:
        if not PANDAS_IMAGE_METHODS_AVAILABLE:
            logger.error("pandas-image-methods is required for --vision flag. Install with: pip install pandas-image-methods")
            sys.exit(1)
        
        # Look for vision data files
        vision_files = []
        
        # Check for HuggingFace format (metadata.jsonl)
        metadata_jsonl = "vision_dataset/metadata.jsonl"
        if os.path.isfile(metadata_jsonl):
            vision_files.append((metadata_jsonl, 'jsonl'))
        
        # Check for CSV format vision logs
        vision_csv = "vision_logs.csv"
        if os.path.isfile(vision_csv):
            vision_files.append((vision_csv, 'csv'))
        
        # Check for numbered files
        i = 1
        while True:
            jsonl_file = f"vision_dataset{i}/metadata.jsonl"
            csv_file = f"vision_logs{i}.csv"
            found_any = False
            
            if os.path.isfile(jsonl_file):
                vision_files.append((jsonl_file, 'jsonl'))
                found_any = True
            if os.path.isfile(csv_file):
                vision_files.append((csv_file, 'csv'))
                found_any = True
                
            if not found_any:
                break
            i += 1
        
        if not vision_files:
            logger.error("No vision dataset files found for --vision flag!")
            logger.info("Looking for:")
            logger.info("  - vision_dataset/metadata.jsonl (HuggingFace format)")
            logger.info("  - vision_logs.csv (CSV format)")
            logger.info("  - vision_datasetN/metadata.jsonl")
            logger.info("  - vision_logsN.csv")
            sys.exit(1)
        
        logger.info(f"Found {len(vision_files)} vision files: {[f for f, _ in vision_files]}")
        
        # Process all vision files
        all_vision_data = []
        total_count = 0
        file_counts = {}
        
        for file_path, file_type in vision_files:
            if file_type == 'jsonl':
                vision_data = extract_vision_data_from_jsonl(file_path)
            else:  # csv
                vision_data = extract_vision_conversations_from_csv(file_path)
            
            file_counts[file_path] = len(vision_data)
            all_vision_data.extend(vision_data)
            total_count += len(vision_data)
        
        if not all_vision_data:
            logger.error("No valid vision data found!")
            sys.exit(1)
        
        # Check for tokenization flags
        do_tokenize = '--tokenize' in sys.argv
        tokenizer = None
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if do_tokenize:
            logger.info("Loading tokenizer 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit'...")
            tokenizer = AutoTokenizer.from_pretrained("unsloth/Llama-3.2-1B-Instruct-bnb-4bit")
        
        # Tokenize if requested
        if do_tokenize and tokenizer:
            all_texts = []
            for entry in all_vision_data:
                all_texts.append(entry['input'])
                all_texts.append(entry['output'])
            
            total_tokens = 0
            logger.info("Tokenizing vision data...")
            for text in tqdm(all_texts, desc="Tokenizing", unit="msg"):
                encoded = tokenizer(text, return_tensors="pt")
                input_ids = encoded["input_ids"].to(device)
                total_tokens += input_ids.shape[-1]
            logger.info(f"Total tokens across all vision data: {total_tokens}")
        
        # Remove duplicates based on conversation content
        unique_vision_data = []
        seen_keys = set()
        
        for conversation in all_vision_data:
            # Create a key from the text content of the conversation
            key_parts = []
            for msg in conversation:
                if msg["role"] in ["user", "assistant"]:
                    for content_part in msg["content"]:
                        if content_part["type"] == "text":
                            key_parts.append(content_part["text"].strip())
            
            key = tuple(key_parts)
            if key not in seen_keys:
                seen_keys.add(key)
                unique_vision_data.append(conversation)
        
        all_vision_data = unique_vision_data
        logger.info(f"After deduplication: {len(all_vision_data)} unique vision conversations")
        
        # Shuffle the data
        random.shuffle(all_vision_data)
        
        # Images are already in parquet-compatible dict format within all_vision_data
        # No further image processing needed here before creating DataFrame
        
        # Create DataFrame with conversations column (unsloth format)
        df_final = pd.DataFrame({"conversations": all_vision_data})
        
        output_parquet = "Andy_vision_conversations.parquet"
        
        logger.info(f"Writing vision dataset to {output_parquet}")
        try:
            df_final.to_parquet(output_parquet, index=False)
            abs_path = os.path.abspath(output_parquet)
            logger.info(f"Successfully wrote vision dataset to: {abs_path}")
        except Exception as e:
            logger.error(f"Error writing Parquet file: {e}")
            sys.exit(1)
        
        logger.info(
            f"\n"
            f"--------------------------------------------------------------------------------------\n"
            f"Vision conversion complete! Processed {total_count} vision conversations from {len(vision_files)} files.\n"
            f"Replaced {username_replaced_count} usernames across conversations.\n"
            f"Total usernames available: {len(MINECRAFT_USERNAMES)}\n"
            f"Final dataset size: {len(all_vision_data)} unique conversations\n"
            f"--------------------------------------------------------------------------------------\n"
        )
        
        # Log counts per file
        for file_path, count in file_counts.items():
            logger.info(f"File '{file_path}' contributed {count} conversations.")
        
        sys.exit(0)
    
    # Regular processing for non-vision data
    base_filename = "Andy_pre"
    files = []
    i = 1
    while True:
        csv_file = f"{base_filename}{i}.csv"
        json_file = f"{base_filename}{i}.json"
        if not os.path.isfile(csv_file) and not os.path.isfile(json_file):
            break
        if os.path.isfile(csv_file):
            files.append((csv_file, 'csv'))
        if os.path.isfile(json_file):
            files.append((json_file, 'json'))
        i += 1

    if not files:
        logger.info("No CSV or JSON files found with pattern Andy_preN.(csv|json)")
        sys.exit(1)

    # Check for tokenization flags
    do_tokenize = '--tokenize' in sys.argv
    do_tokenize_largest = '--tokenize_largest' in sys.argv
    tokenizer = None
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if do_tokenize or do_tokenize_largest:
        logger.info("Loading tokenizer 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit'...")
        tokenizer = AutoTokenizer.from_pretrained("unsloth/Llama-3.2-1B-Instruct-bnb-4bit")

    logger.info(f"Found {len(files)} files: {[f for f, _ in files]}")
    combined_conversations = []
    total_count = 0
    file_conversation_counts = {}

    for file, ftype in files:
        if ftype == 'csv':
            convs = extract_conversations_from_csv(file)
        else:
            convs = extract_conversations_from_json(file)
        file_conversation_counts[file] = len(convs)
        combined_conversations.extend(convs)
        total_count += len(convs)

    # Tokenize all data and count tokens
    if do_tokenize:
        all_texts = [msg["value"] for conv in combined_conversations for msg in conv]
        total_tokens = 0
        logger.info("Tokenizing all data with progress bar and GPU acceleration...")
        for text in tqdm(all_texts, desc="Tokenizing", unit="msg"):
            encoded = tokenizer(text, return_tensors="pt")
            input_ids = encoded["input_ids"].to(device)
            total_tokens += input_ids.shape[-1]
        logger.info(f"Total tokens across all data: {total_tokens}")

    # Tokenize 5 largest conversations
    if do_tokenize_largest:
        conv_token_counts = []
        logger.info("Tokenizing largest conversations with progress bar and GPU acceleration...")
        for conv in tqdm(combined_conversations, desc="Tokenizing convs", unit="conv"):
            text = "\n".join(msg["value"] for msg in conv)
            encoded = tokenizer(text, return_tensors="pt")
            input_ids = encoded["input_ids"].to(device)
            conv_token_counts.append((input_ids.shape[-1], conv))
        # sort and take top 5
        conv_token_counts.sort(key=lambda x: x[0], reverse=True)
        top5 = conv_token_counts[:5]
        max_tokens = max(count for count, _ in top5)
        for idx, (count, _) in enumerate(top5, 1):
            logger.info(f"Top {idx} conversation tokens: {count}")
        logger.info(f"Maximum tokens in top 5: {max_tokens}")

    # Clean up GPT messages
    for conv in combined_conversations:
        for msg in conv:
            if msg["from"] == "gpt":
                msg["value"] = msg["value"].replace("<think>\nundefined</think>\n", "").replace("<think>\nundefined</think>", "").strip()

    unique_conversations = []
    seen_keys = set()
    for conv in combined_conversations:
        if len(conv) < 2:
            key = tuple(msg["value"] for msg in conv)
        else:
            key = (conv[0]["value"].strip(), conv[-1]["value"].strip())
        if key not in seen_keys:
            seen_keys.add(key)
            unique_conversations.append(conv)
    combined_conversations = unique_conversations

    random.shuffle(combined_conversations)

    # Handle codeOnly flag
    if '--codeOnly' in sys.argv:
        coding = []
        noncoding = []
        for conv in combined_conversations:
            has_code = any("```" in msg["value"] for msg in conv) or (
                conv and conv[-1]["from"] == "gpt" and "!newAction(" in conv[-1]["value"]
            )
            if has_code:
                coding.append(conv)
            else:
                noncoding.append(conv)
        logger.info(f"Found {len(coding)} coding examples and {len(noncoding)} non-coding examples.")
        noncoding_count = int(round(0.15 * len(coding)))
        if noncoding_count > len(noncoding):
            noncoding_count = len(noncoding)
        selected_noncoding = random.sample(noncoding, noncoding_count) if noncoding_count > 0 else []
        final_conversations = coding + selected_noncoding
        random.shuffle(final_conversations)
        combined_conversations = final_conversations

    if '--codeOnly' in sys.argv:
        df_final = pd.DataFrame({"conversations": combined_conversations})
        output_parquet = "Andy_conversations_codeOnly.parquet"
    else:
        df_final = pd.DataFrame({"conversations": combined_conversations})
        output_parquet = "Andy_conversations.parquet"

    logger.info(f"Writing output to {output_parquet}")
    try:
        df_final.to_parquet(output_parquet, index=False)
        abs_path = os.path.abspath(output_parquet)
        logger.info(f"Successfully wrote output to: {abs_path}")
    except Exception as e:
        logger.debug(f"Error writing Parquet file: {e}")
        sys.exit(1)

    logger.info(
        f"\n"
        f"--------------------------------------------------------------------------------------\n\n"
        f"Conversion complete! Processed {total_count} conversations from {len(files)} files. \n"
        f"Replaced {username_replaced_count} usernames across {total_count} conversations. \n"
        f"Total amount of usernames to choose from: {len(MINECRAFT_USERNAMES)} (removed {duplicate_count} duplicates) \n"
        f"--------------------------------------------------------------------------------------\n\n"
    )

    # Log conversation counts per file.
    for file, count in file_conversation_counts.items():
        logger.info(f"File '{file}' contributed {count} conversations.")
