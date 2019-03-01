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
    TransportKind,
    CancellationTokenSource
} from 'vscode-languageclient';

// for running cvc4 as a child process
import * as child_process from 'child_process';


// for reading cvc4 settings from a json file
import * as fs from 'fs';

interface CVC4Settings {
    cvc4Executable: string;
    cvc4Arguments: string[];
    isVerbose: boolean;
}

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {

    // register cvc4 commands
    const command = 'extension.runCVC4';
    context.subscriptions.push(vscode.commands.registerCommand(command, runCVC4Command));

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
        documentSelector: [{ scheme: 'file', language: 'cvc' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'languageServerExample',
        'Language Server Example',
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

    let document: vscode.TextDocument = vscode.window.activeTextEditor.document;

    let cvc4Settings: CVC4Settings;

    try {
        cvc4Settings = JSON.parse(fs.readFileSync('.vscode/cvc4-settings.json', 'utf8'));
        // remove parse-only 
        if (cvc4Settings.cvc4Arguments.indexOf('--parse-only') > -1) {
            delete cvc4Settings.cvc4Arguments['--parse-only'];
        }
    }
    catch (error) {
        // create a json file for cvc4 settings
        let isWindows: boolean = process.platform === "win32";
        let cvc4Executable: string;
        cvc4Executable = 'cvc4';

        // default CVC4 arguments
        const cvc4Arguments: string[] = ['--lang', 'cvc4', '--incremental'];
        cvc4Settings = { cvc4Executable: cvc4Executable, cvc4Arguments: cvc4Arguments, isVerbose: false };
        let json = JSON.stringify(cvc4Settings, null, 4);
        fs.writeFile('.vscode/cvc4-settings.json', json, 'utf8', () => { });
    }


    
    var child: child_process.ChildProcess = child_process.spawn(cvc4Settings.cvc4Executable, cvc4Settings.cvc4Arguments);
    child.stdin.setDefaultEncoding('utf-8');
    child.stdout.on('data', (data) => { cvc4OutputChannel.append(data.toString()); });
    child.stderr.on('data', (data) => { cvc4OutputChannel.append(data.toString()); });
    child.stdin.write(document.getText() + '\n');
    child.stdin.end();

    let cvc4Progress: vscode.Progress<{ message?: string; increment?: number }>;
    let cvc4Token: vscode.CancellationToken;
    let cvc4OutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel("cvc4");
    cvc4OutputChannel.show();
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running CVC4",
        cancellable: true
    }, (progress: vscode.Progress<{ message?: string; increment?: number }>,
        token: vscode.CancellationToken) => {

            cvc4Progress = progress;
            cvc4Token = token;

            token.onCancellationRequested(() => {
                console.log("User canceled the process");
                child.kill();
            });

            var p = new Promise(resolve => {
                // while (cvc4Token.isCancellationRequested == false) 
                {
                    // setTimeout(() => {
                    //     resolve();
                    // }, 1000);
                }
            });

            return p;
        });

    child.on('exit', (data) => {cvc4Token.isCancellationRequested = true;});
}
