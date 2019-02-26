/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
    createConnection,
    TextDocuments,
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams
} from 'vscode-languageserver';

// for running cvc4 as a child process
import * as child_process from 'child_process';
// for reading cvc4 settings from a json file
import * as fs from 'fs';

interface CVC4Settings {
    cvc4Executable: string;
    cvc4Arguments: string[];
    isVerbose: boolean;
}

let cvc4Settings : CVC4Settings;

try{
    cvc4Settings = JSON.parse(fs.readFileSync('.vscode/cvc4-settings.json', 'utf8'));
    // add parse only to the arguments list if it doesn't include it
    if (cvc4Settings.cvc4Arguments.indexOf('--parse-only') > -1){
        cvc4Settings.cvc4Arguments.push('--parse-only');
    }
}
catch(error){
    // create a json file for cvc4 settings
    let isWindows: boolean = process.platform === "win32";
    let cvc4Executable: string;
    
    if(isWindows){
        cvc4Executable = 'cvc4.exe';
    }
    else{
        cvc4Executable = 'cvc4.exe';
    }    

    // default CVC4 arguments
    const cvc4Arguments : string[] = ['--lang',  'cvc4', '--incremental','--parse-only'];
    cvc4Settings = {cvc4Executable: cvc4Executable, cvc4Arguments: cvc4Arguments, isVerbose: false};
    let json = JSON.stringify(cvc4Settings,null, 4);
    fs.writeFile('.vscode/cvc4-settings.json', json, 'utf8', () => {});
}


let cvc4ErrorOutput: string[] = [];

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability =
        !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);

    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {

    cvc4ErrorOutput = [];

    var child : child_process.ChildProcess = child_process.execFile(cvc4Settings.cvc4Executable, cvc4Settings.cvc4Arguments);        
    child.stdin.setDefaultEncoding('utf-8');    
    child.stdout.on('data', (data) =>{cvc4ErrorOutput.push(data.toString());});
    child.stderr.on('data', (data) =>{cvc4ErrorOutput.push(data.toString());});      
    child.stdin.write(textDocument.getText() + '\n');
    child.stdin.end();
    child.on('exit', (data) => checkOutput(textDocument));              
    function checkOutput(textDocument: TextDocument)
    {           
        let diagnostics: Diagnostic[] = [];
        let data = cvc4ErrorOutput.join('');        

        // example "Parse Error: <stdin>:10.7: Unexpected token: '('."
        var smtLibPattern = /Parse Error: <stdin>:\d+.\d+:.*/g;
        var parseErrors = data.match(smtLibPattern);
        
        if(parseErrors && parseErrors.length > 0)
        {            
            for(let parseError of parseErrors){                                
                var parts = parseError.split(':');
                var numbers = parts[2].split('.');               

                let lineNumber = parseInt(numbers[0]);
                let columnNumber = parseInt(numbers[1]);

                // for now cvc4 only outputs only one parsing error at a time
                let message: string;
                if(cvc4Settings.isVerbose){
                    message = data;
                }
                else {
                    message = data.replace(/Parse Error: <stdin>:\d+.\d+:/g, 'Parse Error: ');
                }

                let diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: lineNumber, character: columnNumber},
                        end: {line: lineNumber, character: columnNumber},                   
                    },
                    message: message,
                    source: 'Parse'
                };

                diagnostics.push(diagnostic);                
            }
        }

        // Send the computed diagnostics to VSCode.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });     
    }
}



connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            (item.detail = 'TypeScript details'),
                (item.documentation = 'TypeScript documentation');
        } else if (item.data === 2) {
            (item.detail = 'JavaScript details'),
                (item.documentation = 'JavaScript documentation');
        }
        return item;
    }
);

/*
connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
