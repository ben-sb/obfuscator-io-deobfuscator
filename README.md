# Obfuscator.io Deobfuscator

A deobfuscator for scripts obfuscated by Obfuscator.io

## Usage

### Online

An online version is available at [obf-io.deobfuscate.io](https://obf-io.deobfuscate.io)

### CLI

Install via `npm install -g obfuscator-io-deobfuscator`

Usage: `obfuscator-io-deobfuscator <input> -o [output]`

## Features

-   Recovers strings
-   Removes proxy functions
-   Removes and simplifies objects
-   Simplifies arithmetic expressions
-   Simplifies string concatenation
-   Removes dead code
-   Reverses control flow flattening
-   Can handle most obfuscator.io forks
-   Is safe (doesn't run any untrusted code/sandbox)
-   Automatic config detection
