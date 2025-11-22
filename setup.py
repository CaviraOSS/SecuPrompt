from setuptools import setup

from setuptools.command.build_py import build_py
import shutil
from pathlib import Path

class CustomBuildPy(build_py):
    def run(self):
        # Run the standard build process
        super().run()
        
        # Define source and destination
        source_data = Path(__file__).parent / "data"
        # build_lib is where the package is built, e.g., build/lib/secuprompt
        dest_data = Path(self.build_lib) / "secuprompt" / "data_files"
        
        # Copy data files
        if source_data.exists():
            if dest_data.exists():
                shutil.rmtree(dest_data)
            # Create parent dir if it doesn't exist
            dest_data.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source_data, dest_data)
        else:
            print(f"Warning: Data directory {source_data} not found!")

setup(
    packages=["secuprompt"],
    package_dir={"secuprompt": "py"},
    cmdclass={
        'build_py': CustomBuildPy,
    },
)
