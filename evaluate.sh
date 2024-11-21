#!/bin/bash

# Initialize variables
args=()
num_experiments=0
successful=0
unsuccessful=0
error=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --num_experiments)
            num_experiments="$2"
            shift 2
            ;;
        *)
            args+=("$1")
            shift
            ;;
    esac
done

# Validate num_experiments
if ! [[ "$num_experiments" =~ ^[0-9]+$ ]] || [[ "$num_experiments" -eq 0 ]]; then
    echo "Error: num_experiments must be a positive integer"
    echo "Usage: $0 --num_experiments <number> [other arguments]"
    exit 1
fi

# Run experiments
while (( successful + unsuccessful < num_experiments )); do
    node main.js "${args[@]}"
    exit_code=$?
    
    case $exit_code in
        2) ((successful++));;
        3) ((unsuccessful++));;
        4) ((error++));;
        *) echo "Unknown exit code: $exit_code";;
    esac

    # Calculate success percentage
    if [[ $successful -eq 0 && $unsuccessful -eq 0 ]]; then
        success_percentage=0
    else
        success_percentage=$(echo "scale=2; $successful / ($successful + $unsuccessful) * 100" | bc)
    fi

    echo "Success percentage: $success_percentage%"
    echo "Total successful: $successful"
    echo "Total unsuccessful: $unsuccessful"
    echo "Total errors: $error"
    echo "Total experiments run: $((successful + unsuccessful))"
done

# Generate output file with a cleaner name format
date_time=$(date +'%Y-%m-%d_%H-%M-%S')
output_file="${date_time}_results.txt"

echo "Total experiments: $num_experiments" > "$output_file"
echo "Successful experiments: $successful" >> "$output_file"
echo "Unsuccessful experiments: $unsuccessful" >> "$output_file"
echo "Experiments with errors: $error" >> "$output_file"
echo "Success percentage: $success_percentage%" >> "$output_file"

echo "Results saved in $output_file"