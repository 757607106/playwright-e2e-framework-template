import ts from 'typescript';

/** Syntax-aware baseline; not a substitute for the full Playwright ESLint plugin. */
export function checkTestSource(source: string | ts.SourceFile, file: string, checker?: ts.TypeChecker): string[] {
  const tree = typeof source === 'string' ? ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true) : source;
  const errors: string[] = [];
  const aliases = new Set(['test', 'describe']);
  let fixtureImport = false;
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (file.endsWith('.spec.ts') && /^(?:ai(?:\/|$)|@ai-sdk\/)/.test(statement.moduleSpecifier.text)) errors.push('formal regression must replay data; model imports belong in preparation scripts');
    const imports = statement.importClause?.namedBindings;
    if (!imports || !ts.isNamedImports(imports)) continue;
    for (const item of imports.elements) {
      const original = item.propertyName?.text || item.name.text;
      if (original === 'test') {
        aliases.add(item.name.text);
        if (/(?:^|\/)fixtures(?:\/.*)?$/.test(statement.moduleSpecifier.text)) fixtureImport = true;
      }
    }
  }
  const spec = file.endsWith('.spec.ts');
  if (spec && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.ts$/.test(file.split('/').at(-1) || '')) errors.push('spec name must use kebab-case');
  if (file.startsWith('tests/e2e/') && spec && !fixtureImport) errors.push('import test from tests/fixtures');
  function rootName(node: ts.Expression): string | undefined {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return rootName(node.expression);
    return undefined;
  }
  function isPromiseLike(type: ts.Type, node: ts.Node): boolean {
    if (!checker) return false;
    if (type.isUnion()) return type.types.some(member => isPromiseLike(member, node));
    const then = checker.getPropertyOfType(type, 'then');
    return Boolean(then && checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(then, node), ts.SignatureKind.Call).length);
  }
  function visit(node: ts.Node): void {
    if (checker && !file.startsWith('tests/unit/') && ts.isExpressionStatement(node)) {
      const expression = ts.isVoidExpression(node.expression) ? node.expression.expression : node.expression;
      if (isPromiseLike(checker.getTypeAtLocation(expression), expression)) errors.push('floating promises must be awaited or returned');
    }
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) errors.push('unbounded any casts are forbidden');
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const method = ts.isPropertyAccessExpression(expression) ? expression.name.text
        : ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression) ? expression.argumentExpression.text : undefined;
      if (method === 'only' && aliases.has(rootName(expression) || '')) errors.push('exclusive tests are forbidden');
      if (method === 'waitForTimeout') errors.push('fixed waits are forbidden');
      if (spec && checker && ['generate', 'generateObject'].includes(method ?? '')) {
        const declaration = checker.getResolvedSignature(node)?.declaration;
        if (declaration?.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/support/data-generation/types.ts')) errors.push('formal regression must replay data; recipe generation belongs in preparation scripts');
        if (declaration?.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/support/llm/client.ts')) errors.push('formal regression must replay data; model requests belong in preparation scripts');
      }
      if (spec && method && ['click', 'dblclick', 'check', 'uncheck', 'fill', 'hover', 'selectOption', 'tap', 'setChecked', 'press'].includes(method)) {
        for (const argument of node.arguments) if (ts.isObjectLiteralExpression(argument)) {
          for (const property of argument.properties) if (ts.isPropertyAssignment(property) && property.name.getText(tree).replace(/['"]/g, '') === 'force' && property.initializer.kind === ts.SyntaxKind.TrueKeyword) errors.push('forced UI actions are forbidden');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return [...new Set(errors)];
}
