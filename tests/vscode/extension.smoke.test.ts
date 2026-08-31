import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('salvo extension smoke', () => {
  test('activates in the quickstart workspace and registers its commands', async () => {
    const ext = vscode.extensions.getExtension('jungsehui.salvo');
    assert.ok(ext, 'extension jungsehui.salvo not found');
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['salvo.runCases', 'salvo.selectEnvironment', 'salvo.setSecret', 'salvo.refreshSchema']) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });
});
