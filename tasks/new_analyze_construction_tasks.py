from evaluation_script import analyze_json_file, extract_result, aggregate_results, check_folder_results
import argparse

def main():

    parser = argparse.ArgumentParser(description="Analyze JSON files for construction tasks.")
    parser.add_argument('--log_dir', type=str, nargs='+', help='Log dir to analyze')

    args = parser.parse_args()
    log_dir = args.log_dir[0]
    print(log_dir)

    results = check_folder_results(log_dir)
    print(results)

if __name__ == "__main__":
    main()