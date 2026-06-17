#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = {
  cwd: process.cwd(),
  message: 'fix: auto deploy update',
  remote: 'origin',
  branch: 'main',
  keyPath: 'C:\\Users\\박찬규\\Desktop\\ssh-key-2026-05-25.key',
  user: 'ubuntu',
  host: '140.245.76.33',
  remotePath: '/home/ubuntu/softlap',
  pm2Process: 'softlap'
};

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2).replace(/-([a-z])/g, g => g[1].toUpperCase());
    const val = process.argv[i + 1];
    if (val && !val.startsWith('--')) {
      args[key] = val;
      i++;
    }
  }
}

function runCommand(cmd, cwd) {
  console.log(`Executing: ${cmd}`);
  try {
    execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}\n`, error.message);
    process.exit(1);
  }
}

function deploy() {
  console.log("=== [Step 1] Local Git push to GitHub ===");
  runCommand("git add .", args.cwd);
  
  let status = "";
  try {
    status = execSync("git status --porcelain", { cwd: args.cwd, encoding: 'utf8' });
  } catch (e) {}

  if (status.trim()) {
    runCommand(`git commit -m "${args.message}"`, args.cwd);
    runCommand(`git push ${args.remote} ${args.branch}`, args.cwd);
  } else {
    console.log("No local changes to commit. Proceeding to push just in case...");
    try {
      runCommand(`git push ${args.remote} ${args.branch}`, args.cwd);
    } catch (e) {
      console.log("Push skipped (already up-to-date or no changes).");
    }
  }

  console.log("\n=== [Step 2] Remote deployment on OCI VM ===");
  const sshCmd = `ssh -i "${args.keyPath}" -o BatchMode=yes ${args.user}@${args.host} "cd ${args.remotePath} && git pull ${args.remote} ${args.branch} && pm2 reload ${args.pm2Process}"`;
  runCommand(sshCmd);
  
  console.log("\n🎉 Deployment completed successfully!");
}

const command = process.argv[2];
if (command === 'run') {
  deploy();
} else {
  console.log("Usage: node deploy.js run [--message 'msg'] [--key-path 'path'] ...");
}