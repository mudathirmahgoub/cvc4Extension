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

let cvc4Keywords: string[] = "ASSERT|QUERY|CHECKSAT|OPTION|PUSH|POP|POPTO|PUSH_SCOPE|POP_SCOPE|POPTO_SCOPE|RESET|DATATYPE|END|CONTEXT|FORGET|GET_TYPE|CHECK_TYPE|GET_CHILD|GET_OP|GET_VALUE|SUBSTITUTE|DBG|TRACE|UNTRACE|HELP|TRANSFORM|PRINT|PRINT_TYPE|CALL|ECHO|EXIT|INCLUDE|DUMP_PROOF|DUMP_UNSAT_CORE|DUMP_ASSUMPTIONS|DUMP_SIG|DUMP_TCC|DUMP_TCC_ASSUMPTIONS|DUMP_TCC_PROOF|DUMP_CLOSURE|DUMP_CLOSURE_PROOF|WHERE|ASSERTIONS|ASSUMPTIONS|COUNTEREXAMPLE|COUNTERMODEL|ARITH_VAR_ORDER|CONTINUE|RESTART|REC-FUN|AND|BOOLEAN|ELSIF|ELSE|ENDIF|FALSE|IF|IN|INT|LET|IS_IN|NOT|OR|REAL|THEN|TRUE|TYPE|XOR|ARRAY|OF|WITH|SUBTYPE|SET|TUPLE|FORALL|EXISTS|PATTERN|LAMBDA|MOD|DIV|FLOOR|ABS|DIVISIBLE|DISTINCT|BITVECTOR|BVPLUS|BVSUB|BVUDIV|BVSDIV|BVUREM|BVSREM|BVSMOD|BVSHL|BVASHR|BVLSHR|BVUMINUS|BVMULT|BVXOR|BVNAND|BVNOR|BVCOMP|BVXNOR|BVTOINT|INTTOBV|BOOLEXTRACT|IS_INTEGER|BVLT|BVGT|BVLE|BVGE|SX|BVZEROEXTEND|BVREPEAT|BVROTL|BVROTR|BVSLT|BVSGT|BVSLE|BVSGE|JOIN|TRANSPOSE|PRODUCT|TCLOSURE|IDEN|JOIN_IMAGE|STRING|CONCAT|LENGTH|CONTAINS|SUBSTR|CHARAT|INDEXOF|REPLACE|PREFIXOF|SUFFIXOF|STRING_TO_INTEGER|INTEGER_TO_STRING|CARD|HAS_CARD|UNIVERSE".split("|");
let cvc4CompletionItems: CompletionItem[] = cvc4Keywords.map(keyword => (
    {
        label: keyword,
        kind: CompletionItemKind.Text,
        data: keyword
    })
);



interface CVC4Settings {
    executable: string;
    arguments: string[];
    isVerbose: boolean;
}

// default cvc4 settings
let cvc4DefaultSettings: CVC4Settings = {
    executable: "cvc4",
    arguments: [
        "--lang",
        "cvc4",
        "--incremental",
        "--parse-only",
        "--strict-parsing"
    ],
    isVerbose: false
};

// current cvc4 settings
let cvc4Settings: CVC4Settings;
// parsing errors
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

// The global settings, used when the `workspace/configuration` request is not supported by the client.
let globalSettings: CVC4Settings = cvc4DefaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<CVC4Settings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <CVC4Settings>(
            (change.settings.cvc4 || cvc4DefaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<CVC4Settings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({ section: 'cvc4' });
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
documents.onDidChangeContent(async change => {
    // get cvc4 settings from the client
    cvc4Settings = await getDocumentSettings(change.document.uri);
    cvc4Settings.arguments.push('--parse-only');
    validateTextDocument(change.document);       
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {

    cvc4ErrorOutput = [];

    var child: child_process.ChildProcess = child_process.spawn(cvc4Settings.executable, cvc4Settings.arguments);
    child.stdin.setDefaultEncoding('utf-8');
    child.stdout.on('data', (data) => { cvc4ErrorOutput.push(data.toString()); });
    child.stderr.on('data', (data) => { cvc4ErrorOutput.push(data.toString()); });
    child.stdin.write(textDocument.getText() + '\n');
    child.stdin.end();
    child.on('exit', (data) => checkOutput(textDocument));
    function checkOutput(textDocument: TextDocument) {
        let diagnostics: Diagnostic[] = [];
        let data = cvc4ErrorOutput.join('');

        // example "Parse Error: <stdin>:10.7: Unexpected token: '('."
        var smtLibPattern = /Parse Error: <stdin>:\d+.\d+:.*/g;
        var parseErrors = data.match(smtLibPattern);

        if (parseErrors && parseErrors.length > 0) {
            for (let parseError of parseErrors) {
                var parts = parseError.split(':');
                var numbers = parts[2].split('.');

                let lineNumber = parseInt(numbers[0]);
                let columnNumber = parseInt(numbers[1]);

                // for now cvc4 only outputs only one parsing error at a time
                let message: string;
                if (cvc4Settings.isVerbose) {
                    message = data;
                }
                else {
                    message = data.replace(/Parse Error: <stdin>:\d+.\d+:/g, 'Parse Error: ');
                }

                let diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: columnNumber },
                        end: { line: lineNumber, character: columnNumber },
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
        return cvc4CompletionItems;
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        switch (item.data) {
            case "CARD": item.documentation = "Cardinality"; break;
            case "TCLOSURE": item.documentation = "Transitive Closure"; break;
            default: break;
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
