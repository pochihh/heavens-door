import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalURL} from '../src/external-links';
test('external navigation accepts web and email links while rejecting executable and local protocols',()=>{
 assert.equal(externalURL('https://example.com/a?q=hello#part'),'https://example.com/a?q=hello#part');
 assert.equal(externalURL(' HTTP://EXAMPLE.COM '),'http://example.com/');
 assert.equal(externalURL('mailto:reader@example.com?subject=Notes'),'mailto:reader@example.com?subject=Notes');
 for(const value of [null,{},'javascript:alert(1)','file:///etc/passwd','data:text/html,hello','heavens-asset://key/file','card:123','wiki:Note','Note.md','//example.com','https://example.com/\nrun','https://example.com/'+ 'x'.repeat(8192)])assert.equal(externalURL(value),undefined);
});
