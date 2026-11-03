import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noticeMessage,noticeReport} from '../src/notice';

test('diagnostic reports preserve the failure and version without workspace roots or URL credentials',()=>{
 const message="Error: Error invoking remote method 'workspace:request': Error: Could not save /Users/test/Notes/A.md\nhttps://user:password@example.com/file?token=private#secret\nAuthorization: Bearer private\nAPI_KEY=private\nToken: private";
 assert.equal(noticeMessage(message).split('\n')[0],'Could not save /Users/test/Notes/A.md');
 const report=noticeReport(message,{root:'/Users/test/Notes',document:'A.md',version:'0.1.2718-test.38'},'2026-11-02T20:00:00.000Z');
 assert.equal(report.message.split('\n')[0],'Could not save <workspace>/A.md');
 assert.match(report.message,/https:\/\/example.com\/file\?redacted/);
 assert.doesNotMatch(JSON.stringify(report),/private|password|\/Users\/test|#secret/);
 assert.deepEqual({version:report.appVersion,time:report.occurredAt,document:report.document,code:report.code},{version:'0.1.2718-test.38',time:'2026-11-02T20:00:00.000Z',document:'A.md',code:'OPERATION_FAILED'});
 assert.equal(noticeReport('History unavailable',{version:'test',severity:'warning',code:'HISTORY_UNAVAILABLE'}).severity,'warning');
});
