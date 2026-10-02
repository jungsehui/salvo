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

  test('opens a .salvo file in the visual editor', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'quickstart workspace folder missing');
    const uri = vscode.Uri.joinPath(folder.uri, 'countries.salvo');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'salvo.editor');
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom, 'active tab is not a custom editor');
    assert.strictEqual(input.viewType, 'salvo.editor');
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('salvo.openEditor'), 'missing command salvo.openEditor');
  });
});
