#!/bin/bash

# Script to replace react-toastify with react-hot-toast across the codebase
echo "Updating toast library usage across the codebase..."

# Find all JS/JSX files containing react-toastify imports
FILES=$(grep -l "import.*react-toastify" --include="*.js" --include="*.jsx" -r ./src)

# Process each file
for file in $FILES; do
  echo "Updating $file"
  
  # Replace import statement
  sed -i 's/import { toast } from '\''react-toastify'\'';/import toast from '\''react-hot-toast'\'';/g' "$file"
  
  # Replace toast.info with toast
  sed -i 's/toast\.info(/toast(/g' "$file"
  
  # Replace toast.success with toast.success
  sed -i 's/toast\.success(\(.*\))/toast.success(\1)/g' "$file"
  
  # Replace toast.error with toast.error  
  sed -i 's/toast\.error(\(.*\))/toast.error(\1)/g' "$file"
  
  # Replace toast.warning with custom toast
  sed -i 's/toast\.warning(\(.*\))/toast(\1, { icon: "⚠️" })/g' "$file"
done

# Remove ToastContainer imports
grep -l "import.*ToastContainer.*from 'react-toastify'" --include="*.js" --include="*.jsx" -r ./src | xargs -I{} sed -i 's/import { ToastContainer } from '\''react-toastify'\'';/\/\/ Removed ToastContainer import/g' "{}"
grep -l "import.*react-toastify/dist/ReactToastify.css" --include="*.js" --include="*.jsx" -r ./src | xargs -I{} sed -i 's/import '\''react-toastify\/dist\/ReactToastify\.css'\'';/\/\/ Removed react-toastify CSS import/g' "{}"

echo "Toast library migration completed successfully!"
