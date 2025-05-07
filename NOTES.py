import os

def collect_file_contents(root_dir, exclude_files, exclude_dirs):
    output_lines = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip directories that are in the exclude_dirs list
        dirnames[:] = [d for d in dirnames if os.path.relpath(os.path.join(dirpath, d), root_dir) not in exclude_dirs]

        # Process each file
        for filename in filenames:
            relative_path = os.path.relpath(os.path.join(dirpath, filename), root_dir).replace("\\", "/")

            # Skip the file if it's in the exclusion list
            if relative_path in exclude_files:
                continue

            file_path = os.path.join(dirpath, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                output_lines.append(f"{relative_path} :\n{content}\n\n")
            except Exception as e:
                output_lines.append(f"{relative_path} :\n[Error reading file: {e}]\n\n")

    return output_lines

if __name__ == "__main__":
    root_directory = "."  # Current directory
    output_file = "NOTES.txt"

    # Default exclusion list including files and directories
    exclude_files = {"NOTES.py", output_file, "package-lock.json", ".gitignore", "NOTES.txt", "public/favicon.ico", }
    exclude_dirs = {"node_modules",".git"}  # Excluding node_modules directory

    # Get additional files to exclude
    exclude_files_input = input("Enter additional files to exclude (comma-separated): ")
    exclude_files.update(file.strip() for file in exclude_files_input.split(','))

    # Get additional directories to exclude
    exclude_dirs_input = input("Enter additional directories to exclude (comma-separated): ")
    exclude_dirs.update(os.path.relpath(os.path.join(root_directory, dir.strip()), root_directory) for dir in exclude_dirs_input.split(','))

    all_contents = collect_file_contents(root_directory, exclude_files, exclude_dirs)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(all_contents)

    print(f"✅ All file contents saved to: {output_file} (excluding files: {', '.join(exclude_files)} and directories: {', '.join(exclude_dirs)})")
