
import {spawn} from 'child_process';

var child = spawn('dir');
child.stdout.on('data', (chunk: string | Buffer) => {
    console.log(chunk);
});

