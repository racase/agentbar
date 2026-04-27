# Security Policy

## Reporting

If you find a security issue, please open a private security advisory or contact the maintainer privately instead of posting the full details in a public issue.

## Sensitive data

This project can read local AI tool usage data and, in some flows, temporary browser session cookies stored on the local machine. Those files are intentionally excluded from Git and must never be committed.

Before opening a pull request, verify that you are not including:

- local cookies
- browser session exports
- `.env` files
- local app state folders
- generated build output
