/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as vscode from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';

let cvc4Settings = vscode.workspace.getConfiguration('cvc4');
let currentLanguage = 'cvc4';
let lastLanguage = currentLanguage;
let cvc4Arguments: string[] = [];
cvc4Arguments.push.apply(cvc4Arguments, cvc4Settings.arguments);
cvc4Arguments.push.apply(cvc4Arguments, ["--lang", currentLanguage]);


let cvc4Terminal: vscode.Terminal = vscode.window.createTerminal("cvc4");

cvc4Terminal.sendText(cvc4Settings.executable + " " + cvc4Arguments.join(' '));

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {

    // register cvc4 commands
    const command = 'extension.runCVC4';
    context.subscriptions.push(vscode.commands.registerCommand(command, runCVC4Command));
    // rerun the terminal when cvc4 settings are changed
    vscode.workspace.onDidChangeConfiguration(event => {
        cvc4Settings = vscode.workspace.getConfiguration('cvc4');
        cvc4Terminal.dispose();
        cvc4Terminal = vscode.window.createTerminal("cvc4");
        cvc4Terminal.sendText(cvc4Settings.executable + " " + cvc4Arguments.join(' '));
    });
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [ { scheme: 'file', language: 'cvc' },
                            { scheme: 'file', language: 'smt' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        },
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'cvc4',
        'CVC4 extension',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

function runCVC4Command() {
    // get the current document   
    let currentDocument: vscode.TextDocument = vscode.window.activeTextEditor.document;
    // declare the reset command
    let resetCommand: string;
    // check the extension
    if (currentDocument.uri.fsPath.endsWith('.cvc')) {
        currentLanguage = 'cvc4';
        resetCommand = 'RESET;';
    }
    if (currentDocument.uri.fsPath.endsWith('.smt2')) {
        currentLanguage = 'smtlib2.6';
        resetCommand = '(reset)\n';
    }
    // create a new terminal if the language is different than last one
    if (currentLanguage != lastLanguage) {
        lastLanguage = currentLanguage;
        cvc4Arguments = [];
        cvc4Arguments.push.apply(cvc4Arguments, cvc4Settings.arguments);
        cvc4Arguments.push.apply(cvc4Arguments, ["--lang", currentLanguage]);
        cvc4Terminal.dispose();
        cvc4Terminal = vscode.window.createTerminal("cvc4");
        cvc4Terminal.sendText(cvc4Settings.executable + " " + cvc4Arguments.join(' '));
        // wait for a second for the terminal to launch
        setTimeout(() => { sendCodeToTerminal(currentDocument, resetCommand); }
            , 1000);
    }
    else {
        sendCodeToTerminal(currentDocument, resetCommand);
    }
}

function sendCodeToTerminal(currentDocument: vscode.TextDocument, resetCommand: string) {
    cvc4Terminal.show(true);
    const editor = vscode.window.activeTextEditor;
    if (editor.selection.isEmpty) {
        cvc4Terminal.sendText(resetCommand);
        // send the whole text
        cvc4Terminal.sendText(currentDocument.getText());
    }
    else {
        if (editor.selection.start.line == 0 &&
            editor.selection.start.character == 0) {
            cvc4Terminal.sendText(resetCommand);
        }
        cvc4Terminal.sendText(currentDocument.getText(editor.selection));
    }
}