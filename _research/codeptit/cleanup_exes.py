import os
import glob

def cleanup():
    # Search for .exe files in the directory where this script is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    exe_files = glob.glob(os.path.join(current_dir, "*.exe"))

    for file_path in exe_files:
        try:
            os.remove(file_path)
            print(f"Deleted: {os.path.basename(file_path)}")
        except OSError as e:
            print(f"Error deleting {os.path.basename(file_path)}: {e}")

if __name__ == "__main__":
    cleanup()