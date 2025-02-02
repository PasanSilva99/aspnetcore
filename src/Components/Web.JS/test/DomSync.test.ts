import { expect, test, describe } from '@jest/globals';
import { CommentBoundedRange, synchronizeDomContent } from '../src/Rendering/DomMerging/DomSync';

describe('DomSync', () => {
  test('should remove everything if new content is empty', () => {
    // Arrange
    const destination = makeExistingContent(`
      <elem a=1><child>Hello</child></elem>
      Text node
      <!-- comment node -->`);
    const newContent = makeNewContent(``);

    expect(destination.startExclusive.nextSibling).not.toBe(destination.endExclusive);

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destination.startExclusive.nextSibling).toBe(destination.endExclusive);
  });

  test('should insert everything if old content is empty', () => {
    // Arrange
    const destination = makeExistingContent(``);
    const newContent = makeNewContent(`
      <elem a=1><child>Hello</child></elem>
      Text node
      <!-- comment node -->`);

    expect(destination.startExclusive.nextSibling).toBe(destination.endExclusive);

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destination.startExclusive.nextSibling).not.toBe(destination.endExclusive);
  });

  test('should retain text and comment nodes while inserting and deleting others, updating textContent in place', () => {
    // Arrange
    const destination = makeExistingContent(`First<!--comment1-->Second<!--comment2--><!--comment3-will-delete-->Third`);
    const newContent = makeNewContent(`<!--inserted-->First edited<!--comment1 edited-->Second<!--comment2-->Third edited`);
    const oldNodes = toNodeArray(destination);

    // Act
    synchronizeDomContent(destination, newContent);
    const newNodes = toNodeArray(destination);

    // Assert
    expect(newNodes.length).toBe(6);
    expect(newNodes[0].textContent).toBe('inserted');
    expect(newNodes[1].textContent).toBe('First edited');
    expect(newNodes[2].textContent).toBe('comment1 edited');
    expect(newNodes[3].textContent).toBe('Second');
    expect(newNodes[4].textContent).toBe('comment2');
    expect(newNodes[5].textContent).toBe('Third edited');

    expect(newNodes[1]).toBe(oldNodes[0]);
    expect(newNodes[2]).toBe(oldNodes[1]);
    expect(newNodes[3]).toBe(oldNodes[2]);
    expect(newNodes[4]).toBe(oldNodes[3]);
    expect(newNodes[5]).toBe(oldNodes[5]);
  });

  test('should retain elements when nothing has changed', () => {
    // Arrange
    const destination = makeExistingContent(`<a></a><b></b><a></a><b></b>`);
    const newContent = makeNewContent(`<a></a><b></b><a></a><b></b>`);
    const oldNodes = toNodeArray(destination);

    // Act
    synchronizeDomContent(destination, newContent);
    const newNodes = toNodeArray(destination);

    // Assert
    assertSameContentsByIdentity(newNodes, oldNodes);
  });

  test('should retain elements when inserting new ones', () => {
    // Arrange
    const destination = makeExistingContent(
      `<a></a>` +
      `<b></b>` +
      `<a></a>`);
    const newContent = makeNewContent(
      `<new></new>` +
      `<a></a>` +
      `<new></new>` +
      `<b></b>` +
      `<a></a>` +
      `<new></new>`);
    const oldNodes = toNodeArray(destination);

    // Act
    synchronizeDomContent(destination, newContent);
    const newNodes = toNodeArray(destination) as Element[];

    // Assert
    expect(newNodes[0].tagName).toBe('NEW');
    expect(newNodes[1]).toBe(oldNodes[0]);
    expect(newNodes[2].tagName).toBe('NEW');
    expect(newNodes[3]).toBe(oldNodes[1]);
    expect(newNodes[4]).toBe(oldNodes[2]);
    expect(newNodes[5].tagName).toBe('NEW');
  });

  test('should retain elements when deleting some', () => {
    // Arrange
    const destination = makeExistingContent(
      `<will-delete></will-delete>` +
      `<a></a>` +
      `<will-delete></will-delete>` +
      `<b></b>` +
      `<a></a>` +
      `<will-delete></will-delete>`);
    const newContent = makeNewContent(
      `<a></a>` +
      `<b></b>` +
      `<a></a>`);
    const oldNodes = toNodeArray(destination);

    // Act
    synchronizeDomContent(destination, newContent);
    const newNodes = toNodeArray(destination) as Element[];

    // Assert
    expect(newNodes.length).toBe(3);
    expect(newNodes[0]).toBe(oldNodes[1]);
    expect(newNodes[1]).toBe(oldNodes[3]);
    expect(newNodes[2]).toBe(oldNodes[4]);
  });

  test('should update attribute values, respecting namespaces', () => {
    // Arrange
    const destination = makeExistingContent(
      `<elem a='A' b='B' c='C'></elem>`);
    const newContent = makeNewContent(
      `<elem a='A updated' b='B' c='C updated'></elem>`);
    const targetNode = destination.startExclusive.nextSibling as Element;
    const newContentNode = newContent.firstChild as Element;

    targetNode.setAttributeNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix', 'oldval 1');
    targetNode.setAttributeNS('http://example/namespace2', 'exampleprefix:attributeWithNamespaceAndPrefix', 'oldval 2');

    newContentNode.setAttributeNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix', 'updatedval 1');
    newContentNode.setAttributeNS('http://example/namespace2', 'exampleprefix:attributeWithNamespaceAndPrefix', 'updatedval 2');

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destination.startExclusive.nextSibling).toBe(targetNode); // Preserved the element
    const targetNodeAttribs = targetNode.attributes;
    expect(targetNodeAttribs.length).toBe(5);
    expect(targetNodeAttribs.getNamedItem('a')?.value).toBe('A updated');
    expect(targetNodeAttribs.getNamedItem('b')?.value).toBe('B');
    expect(targetNodeAttribs.getNamedItem('c')?.value).toBe('C updated');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix')?.value).toBe('updatedval 1');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace2', 'attributeWithNamespaceAndPrefix')?.value).toBe('updatedval 2');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace2', 'attributeWithNamespaceAndPrefix')?.name).toBe('exampleprefix:attributeWithNamespaceAndPrefix');
  });

  test('should insert added attributes, including ones with namespace', () => {
    // Arrange
    const destination = makeExistingContent(
      `<elem preserved='preserved value'></elem>`);
    const newContent = makeNewContent(
      `<elem added='added value 1' preserved='preserved value' yetanother='added value 2'></elem>`);
    const targetNode = destination.startExclusive.nextSibling as Element;
    expect(targetNode.attributes.length).toBe(1);

    const newContentNode = newContent.firstChild as Element;
    newContentNode.setAttributeNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix', 'new namespaced value 1');
    newContentNode.setAttributeNS('http://example/namespace2', 'exampleprefix:attributeWithNamespaceAndPrefix', 'new namespaced value 2');

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destination.startExclusive.nextSibling).toBe(targetNode); // Preserved the element
    expect(newContentNode).not.toBe(targetNode);
    const targetNodeAttribs = targetNode.attributes;
    expect(targetNodeAttribs.length).toBe(5);
    expect(targetNodeAttribs.getNamedItem('preserved')?.value).toBe('preserved value');
    expect(targetNodeAttribs.getNamedItem('added')?.value).toBe('added value 1');
    expect(targetNodeAttribs.getNamedItem('yetanother')?.value).toBe('added value 2');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix')?.value).toBe('new namespaced value 1');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace2', 'attributeWithNamespaceAndPrefix')?.value).toBe('new namespaced value 2');
    expect(targetNodeAttribs.getNamedItemNS('http://example/namespace2', 'attributeWithNamespaceAndPrefix')?.name).toBe('exampleprefix:attributeWithNamespaceAndPrefix');
  });

  test('should delete removed attributes, including ones with namespace', () => {
    // Arrange
    const destination = makeExistingContent(
      `<elem will-delete='val1' preserved='preserved value' another-to-delete='val2'></elem>`);
    const newContent = makeNewContent(
      `<elem preserved='preserved value'></elem>`);
    const targetNode = destination.startExclusive.nextSibling as Element;
    const newContentNode = newContent.firstChild as Element;

    targetNode.setAttributeNS('http://example/namespace1', 'attributeWithNamespaceButNoPrefix', 'new namespaced value 1');
    targetNode.setAttributeNS('http://example/namespace2', 'exampleprefix:attributeWithNamespaceAndPrefix', 'new namespaced value 2');
    expect(targetNode.attributes.length).toBe(5);

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destination.startExclusive.nextSibling).toBe(targetNode); // Preserved the element
    expect(newContentNode).not.toBe(targetNode);
    expect(targetNode.getAttributeNames()).toEqual(['preserved']);
    expect(targetNode.getAttribute('preserved')).toBe('preserved value');
  });

  test('should recurse into all elements', () => {
    // Arrange
    const destination = makeExistingContent(
      `<root>` +
        `Text that will change` +
        `<child-will-retain>Text that will be removed</child-will-retain>` +
        `<child-will-delete>Any content</child-will-delete>` +
      `</root>` +
      `<root>` +
        `<another-child-will-retain attr='will-remove'></another-child-will-retain>` +
      `</root>`);
    const newContent = makeNewContent(
      `<root>` +
        `<inserted-child></inserted-child>` +
        `Text that was changed` +
        `<child-will-retain><new-thing attr=val></new-thing></child-will-retain>` +
      `</root>` +
      `<!--newcomment-->` +
      `<root>` +
        `<another-child-will-retain attr='added'>` +
            `<inserted-grandchild></inserted-grandchild>` +
        `</another-child-will-retain>` +
      `</root>`);
    const newContentHtml = toHtml(newContent);
    const oldNodes = toNodeArray(destination);
    const origRoot1 = oldNodes[0];
    const origRoot2 = oldNodes[1];
    const textThatWillChange = oldNodes[0].childNodes[0];
    const childWillRetain = oldNodes[0].childNodes[1];
    const anotherChildWillRetain = oldNodes[1].childNodes[0];

    // Act
    synchronizeDomContent(destination, newContent);
    const newNodes = toNodeArray(destination) as Element[];

    // Assert: we inserted and changed the right elements/textnodes/comments/attributes
    expect(toHtml(newNodes)).toEqual(newContentHtml);

    // Assert: we retained the expected original nodes
    expect(newNodes[0]).toBe(origRoot1);
    expect(newNodes[0].childNodes[1]).toBe(textThatWillChange);
    expect(newNodes[0].childNodes[2]).toBe(childWillRetain);
    expect(newNodes[2]).toBe(origRoot2);
    expect(newNodes[2].childNodes[0]).toBe(anotherChildWillRetain);
  });

  test('should update input element value property when not modified by user', () => {
    // For input-like elements, what we mostly care about is the value *property*,
    // not the attribute. When this property hasn't explicitly been written, it takes
    // its value from the value attribute. However we do still also want to update
    // the attribute to make the DOM as consistent as possible.
    //
    // This test aims to show that, in this situation prior to user edits,
    // we update both the property and attribute to match the new content.

    // Arrange
    const destination = makeExistingContent(
      `<input value='original'>`);
    const newContent = makeNewContent(
      `<input value='changed'>`);
    const destinationNode = toNodeArray(destination)[0] as HTMLInputElement;

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destinationNode.value).toEqual('changed');
    expect(destinationNode.getAttribute('value')).toEqual('changed');
  });

  test('should update input element value when modified by user and changed in new content', () => {
    // After an input-like element is edited (or equivalently, after something
    // is written to its 'value' property), that element's 'value' property
    // no longer stays in sync with the element's 'value' attribute. The property
    // and attribute become independent, and the property is what actually
    // reflects the UI state.
    //
    // This test aims to show that, in this situation after user edits, we still
    // update both the property and attribute to match the new content. This
    // means we are discarding the user's edit, which is desirable because the
    // whole idea of DomSync is to ensure the UI state matches the new content
    // and create an equivalent result to reloading the whole page.

    // Arrange
    const destination = makeExistingContent(
      `<input value='original'>`);
    const newContent = makeNewContent(
      `<input value='changed'>`);
    const destinationNode = toNodeArray(destination)[0] as HTMLInputElement;
    destinationNode.value = 'edited by user';

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destinationNode.value).toEqual('changed');
    expect(destinationNode.getAttribute('value')).toEqual('changed');
  });

  test('should update input element value when modified by user but unchanged in new content', () => {
    // Equivalent to the test above, except the old and new content is identical
    // (so by looking at the attributes alone it seems nothing has to be updated)
    // and we are showing that it still reverts the user's edit

    // Arrange
    const destination = makeExistingContent(
      `<input value='original'>`);
    const newContent = makeNewContent(
      `<input value='original'>`);
    const destinationNode = toNodeArray(destination)[0] as HTMLInputElement;
    destinationNode.value = 'edited by user';

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(destinationNode.value).toEqual('original');
    expect(destinationNode.getAttribute('value')).toEqual('original');
  });

  test('should be able to add select with nonempty option value', () => {
    // Shows that when inserting a completely new <select>, the correct initial
    // value is set and that none of the deferred value assignment logic breaks this.

    // Arrange
    const destination = makeExistingContent(
      ``);
    const newContent = makeNewContent(
      `<select>`
      + `<option value='first'></option>`
      + `<option value='second' selected></option>`
      + `<option value='third'></option>` +
      `</select>`);

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    const selectElem = destination.startExclusive.nextSibling;
    expect(selectElem).toBeInstanceOf(HTMLSelectElement);
    expect((selectElem as HTMLSelectElement).value).toBe('second');
  });

  test('should be able to update select to a newly-added option value', () => {
    // Shows that the introduction of an <option> with 'selected' is sufficient
    // to make the <select>'s 'value' property update, and that none of the
    // deferred value assignment logic breaks this.

    // Arrange
    const destination = makeExistingContent(
      `<select>`
      + `<option value='original1' selected></option>`
      + `<option value='original2'></option>` +
      `</select>`);
    const newContent = makeNewContent(
      `<select>`
      + `<option value='new1'></option>`
      + `<option value='new2'></option>`
      + `<option value='new3' selected></option>` +
      `</select>`);
    const selectElem = destination.startExclusive.nextSibling as HTMLSelectElement;
    selectElem.value = 'original2';

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(selectElem).toBeInstanceOf(HTMLSelectElement);
    expect((selectElem as HTMLSelectElement).value).toBe('new3');
  });

  test('should be able to update an input range to a value outside the min/max of the old content', () => {
    // This shows that the deferred value handling works. We can't actually assign the attributes/properties
    // in the given order, because it would cause the value to exceed the max (as we have not yet updated the
    // max). However it works anyway because of the deferred value assignment mechanism.

    // Arrange
    const destination = makeExistingContent(
      `<input type='range' min='100' max='200' value='150'>`);
    const newContent = makeNewContent(
      `<input type='range' value='1000' min='950' max='1050'>`);
    const inputRange = destination.startExclusive.nextSibling as HTMLInputElement;
    expect(inputRange.value).toBe('150');
    expect(inputRange.min).toBe('100');
    expect(inputRange.max).toBe('200');
    inputRange.value = '175';

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    expect(inputRange.value).toBe('1000');
    expect(inputRange.min).toBe('950');
    expect(inputRange.max).toBe('1050');
  });

  test('should treat doctype nodes as unchanged', () => {
    // Can't update a doctype after the document is created, nor is there a use case for doing so
    // We just have to skip them, as it would be an error to try removing or inserting them

    // Arrange
    const destination = new DOMParser().parseFromString(
      `<!DOCTYPE html>` +
      `<html><body>Hello</body></html>`, 'text/html');
    const newContent = new DOMParser().parseFromString(
      `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">` +
      `<html><body>Goodbye</body></html>`, 'text/html');
    const origDocTypeNode = destination.firstChild!;
    expect(origDocTypeNode.nodeType).toBe(Node.DOCUMENT_TYPE_NODE);
    expect(destination.body.textContent).toBe('Hello');

    // Act
    synchronizeDomContent(destination, newContent);

    // Assert
    const newDocTypeNode = destination.firstChild;
    expect(newDocTypeNode).toBe(origDocTypeNode);
    expect(destination.body.textContent).toBe('Goodbye');
  });
});

function makeExistingContent(html: string): CommentBoundedRange {
  // Returns a structure like:
  //   Unrelated leading content
  //   <!-- start -->
  //   Your HTML
  //   <!-- end -->
  //   Unrelated trailing content
  // (but without all the spacing, and no text in the comment nodes)
  const parent = document.createElement('div');
  parent.innerHTML = html.trim();

  const startComment = document.createComment('');
  const endComment = document.createComment('');

  parent.appendChild(endComment);
  parent.appendChild(document.createTextNode('Unrelated trailing content'));

  parent.insertBefore(startComment, parent.firstChild);
  parent.insertBefore(document.createTextNode('Unrelated leading content'), parent.firstChild);

  return { startExclusive: startComment, endExclusive: endComment };
}

function makeNewContent(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function toNodeArray(range: CommentBoundedRange): Node[] {
  const result: Node[] = [];
  let next = range.startExclusive.nextSibling!;
  while (next !== range.endExclusive) {
    result.push(next);
    next = next.nextSibling!;
  }

  return result;
}

function toHtml(content: DocumentFragment | Node[]) {
  let result = '';
  const nodes = content instanceof DocumentFragment ? content.childNodes : content;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        result += (node as Element).outerHTML;
        break;
      case Node.TEXT_NODE:
        result += node.textContent;
        break;
      case Node.COMMENT_NODE:
        result += `<!--${node.textContent}-->`;
        break;
      default:
        throw new Error(`Not implemented toHTML for node type ${node.nodeType}`);
    }
  }
  return result;
}

function assertSameContentsByIdentity<T>(actual: T[], expected: T[]) {
  if (actual.length !== expected.length) {
    throw new Error(`Expected ${actual} to have length ${expected.length}, but found length ${actual.length}`);
  }

  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]).toBe(expected[i]);
  }
}
