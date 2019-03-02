# CVC4

This extension supports CVC4 language for SMT solver [CVC4](http://cvc4.cs.stanford.edu/web/). The extension activates with (.cvc) files. 

# Configuration

1. [Download](http://cvc4.cs.stanford.edu/downloads/) the cvc4 binary for your operating system.
2. Open visual studio code and update the default configuration for cvc4 executable with the cvc4 binary path: `File -> Preferences ->  Settings -> Extensions -> CVC4 -> Executable`. 
3. Open a (.cvc) file to activate the extension. To run the whole file just press `CTRL + Enter`. If some text is selected, `CTRL + Enter` will only execute that text. 


## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the extension

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the client and server.
- Switch to the Debug viewlet.
- Select `Launch Client` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a cvc4 (.cvc4) document.