# CVC4

This extension supports CVC4 language for SMT solver [CVC4](http://cvc4.cs.stanford.edu/web/). The extension activates with (.cvc) files. 

# Configuration

1. [Download](http://cvc4.cs.stanford.edu/downloads/) the cvc4 binary for your operating system.
2. Open visual studio code and update the default configuration for cvc4 executable using the *full path* of cvc4 binary (`~` wouldn't work): `File -> Preferences ->  Settings -> Extensions -> CVC4 -> Executable`. 
3. Open a cvc4 file (.cvc or .smt2) to activate the extension. To run the whole file just press `SHIFT + Enter`. If some text is selected, `CTRL + Enter` will execute the selected text. If no text is selected, the current line is executed. Below are 2 examples cvc and smt-lib languages.  More examples for can be found in the [web interface](http://kind.cs.uiowa.edu:8080/cvc-app) for cvc4. 

 ```
 % EXPECT: sat

OPTION "produce-models";

x : STRING;
y : STRING;

ASSERT x = CONCAT( "abc", y );
ASSERT CHARAT(x,0) = CHARAT(y,2);
ASSERT LENGTH( y ) >= 3;

CHECKSAT;
COUNTERMODEL;
 ```

```
(set-logic ALL)
(set-option :produce-models true)
(declare-fun x () Int)
(declare-fun y () Int)
(declare-fun z () Int)

(assert (distinct x y z))
(assert (= (+ x y) z))

(check-sat)
(get-model)
 ```

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
- In the [Extension Development Host] instance of VSCode, open cvc4 file (either .cvc4 or .smt2) document, write some code and press `SHIFT + Enter` to execute the code. 

- To build the extension, run the command `vsce package`.