import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    try:
        result = subprocess.run(
            ['node', 'index.js'],
            cwd=Path(__file__).parent,
            check=False
        )
        sys.exit(result.returncode)
    except FileNotFoundError:
        print('Node.js is not installed or not in PATH. Please install Node.js.')
        sys.exit(1)
    except Exception as err:
        print(f'Failed to start bot: {err}')
        sys.exit(1)
