#!/usr/bin/env python3
import argparse
import sys
import subprocess
import os

def run_command(cmd, cwd=None):
    print(f"Executing: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing command: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    print(result.stdout)
    return result.stdout

def deploy(args):
    print("=== [Step 1] Local Git push to GitHub ===")
    run_command("git add .", cwd=args.cwd)
    status = run_command("git status --porcelain", cwd=args.cwd)
    if status.strip():
        run_command(f'git commit -m "{args.message}"', cwd=args.cwd)
        run_command(f"git push {args.remote} {args.branch}", cwd=args.cwd)
    else:
        print("No local changes to commit.")
        try:
            run_command(f"git push {args.remote} {args.branch}", cwd=args.cwd)
        except SystemExit:
            print("Push skipped.")

    print("\n=== [Step 2] Remote deployment on OCI VM ===")
    ssh_cmd = (
        f'ssh -i "{args.key_path}" -o BatchMode=yes {args.user}@{args.host} '
        f'"cd {args.remote_path} && git pull {args.remote} {args.branch} && pm2 reload {args.pm2_process}"'
    )
    run_command(ssh_cmd)
    print("\n🎉 Deployment completed successfully!")

def main():
    parser = argparse.ArgumentParser(description="Softlap Oracle Cloud OCI Auto Deployment CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run", help="Run the deploy workflow")
    run_parser.add_argument("--cwd", default=os.getcwd(), help="Local project directory path")
    run_parser.add_argument("--message", default="fix: auto deploy update", help="Git commit message")
    run_parser.add_argument("--remote", default="origin", help="Git remote name")
    run_parser.add_argument("--branch", default="main", help="Git branch name")
    run_parser.add_argument("--key-path", default="C:\\Users\\박찬규\\Desktop\\ssh-key-2026-05-25.key", help="SSH Key file path")
    run_parser.add_argument("--user", default="ubuntu", help="Remote VM SSH user")
    run_parser.add_argument("--host", default="140.245.76.33", help="Remote VM host IP")
    run_parser.add_argument("--remote-path", default="/home/ubuntu/softlap", help="Remote project path")
    run_parser.add_argument("--pm2-process", default="softlap", help="PM2 process name to reload")
    args = parser.parse_args()
    if args.command == "run":
        deploy(args)

if __name__ == "__main__":
    main()