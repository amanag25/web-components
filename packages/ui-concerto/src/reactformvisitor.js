/* eslint-disable class-methods-use-this */
/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import get from 'lodash.get';
import { Form } from 'semantic-ui-react';
import {
  EnumDeclaration,
  ClassDeclaration,
  Field,
  RelationshipDeclaration,
  Writer,
} from '@accordproject/concerto-core';
import * as util from 'util';

import {
  ConcertoInput,
  ConcertoRelationship,
  ConcertoArray,
  ConcertoArrayElement,
  ConcertoDropdown,
  ConcertoCheckbox,
  ConcertoDateTime,
  ConcertoLabel,
  Duration,
  MonetaryAmount,
} from './components/fields';
import {
  hideProperty,
  findConcreteSubclass,
  getDefaultValue,
  toFieldType,
  pathToString,
  getCustomSelectDecoratorKey,
  isHidden
} from './utilities';

/**
 * Convert the contents of a ModelManager to React compnents.
 * @class
 */
class ReactFormVisitor {
  /**
   * Visitor design pattern
   * @param {Object} thing - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visit(thing, parameters) {
    if (!parameters.fileWriter) {
      // eslint-disable-next-line
      parameters.fileWriter = new Writer();
    }

    if (thing instanceof EnumDeclaration) {
      return this.visitEnumDeclaration(thing, parameters);
    }
    if (thing instanceof ClassDeclaration) {
      return this.visitClassDeclaration(thing, parameters);
    }
    if (thing instanceof Field) {
      return this.visitField(thing, parameters);
    }
    if (thing instanceof RelationshipDeclaration) {
      return this.visitRelationship(thing, parameters);
    }
    throw new Error(
      `Unrecognised type: ${typeof thing}, value: ${util.inspect(thing, {
        showHidden: true,
        depth: 2,
      })}`
    );
  }

  /**
   * Visitor design pattern
   * @param {ClassDeclaration} classDeclaration - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visitClassDeclaration(classDeclaration, parameters) {
    if (parameters.hideIdentifiers) {
      if (!parameters.hiddenFields) {
        // eslint-disable-next-line
        parameters.hiddenFields = [];
      }

      const idFieldName = classDeclaration.getIdentifierFieldName();
      if (idFieldName) {
        const idField = classDeclaration.getProperty(idFieldName);
        parameters.hiddenFields.push(idField.getFullyQualifiedName());
      }
    }

    if (classDeclaration.isAbstract()) {
      return null;
    }

    if (
      [
        'org.accordproject.money.MonetaryAmount',
        'org.accordproject.money.DigitalMonetaryAmount',
      ].includes(classDeclaration.getFullyQualifiedName())
    ) {
      return this.visitMonetaryAmount(classDeclaration, parameters);
    }
    if (
      [
        'org.accordproject.time.Duration',
        'org.accordproject.time.Period',
      ].includes(classDeclaration.getFullyQualifiedName())
    ) {
      return this.visitDuration(classDeclaration, parameters);
    }
    if (
      ['org.accordproject.cicero.contract.AccordParty'].includes(
        classDeclaration.getFullyQualifiedName()
      )
    ) {
      return this.visitAccordParty(classDeclaration, parameters);
    }
    return classDeclaration
      .getProperties()
      .map(p => p.accept(this, parameters));
  }

  visitMonetaryAmount(declaration, parameters) {
    const props = declaration.getProperties();
    // eslint-disable-next-line
    parameters.skipLabel = true;
    const component = (
      <MonetaryAmount key={declaration.getName().toLowerCase()}>
        {props[0].accept(this, parameters)}
        {props[1].accept(this, parameters)}
      </MonetaryAmount>
    );
    // eslint-disable-next-line
    parameters.skipLabel = false;
    return component;
  }

  visitDuration(declaration, parameters) {
    const props = declaration.getProperties();
    // eslint-disable-next-line
    parameters.skipLabel = true;
    const component = (
      <Duration key={declaration.getName().toLowerCase()}>
        {props[0].accept(this, parameters)}
        {props[1].accept(this, parameters)}
      </Duration>
    );
    // eslint-disable-next-line
    parameters.skipLabel = false;
    return component;
  }

  visitAccordParty(declaration, parameters) {
    const props = declaration.getProperties();
    // eslint-disable-next-line
    parameters.skipLabel = true;
    const component = (
      <div key={declaration.getName().toLowerCase()}>{props[0].accept(this, parameters)}</div>
    );
    // eslint-disable-next-line
    parameters.skipLabel = false;
    return component;
  }

  /**
   * Visitor design pattern
   * @param {EnumDeclaration} enumDeclaration - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visitEnumDeclaration(enumDeclaration, parameters) {
    const key = pathToString(parameters.stack);
    const value = get(parameters.json, key);

    return (
      <ConcertoDropdown
        id={key}
        key={`enum-${key}`}
        value={value}
        displayText={value}
        field={enumDeclaration}
        readOnly={parameters.disabled}
        textOnly={parameters.textOnly}
        onFieldValueChange={parameters.onFieldValueChange}
        options={enumDeclaration.getProperties().map(property => ({
          key: `option-${property.getName()}`,
          value: property.getName(),
          text: property.getName(),
        }))}
      />
    );
  }

  /**
   * Visitor design pattern
   * @param {Field} field - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visitField(field, parameters) {
    const {
      skipLabel,
      disabled,
      textOnly,
      addElement,
      removeElement,
      onFieldValueChange,
      stack,
    } = parameters;

    if (hideProperty(field, parameters) || isHidden(field)) {
      return null;
    }

    stack.push(field.getName());
    const key = pathToString(stack);
    const value = get(parameters.json, key);
    let component = null;

    const commonProps = {
      skipLabel: skipLabel || field.isArray(),
      id: key,
      field,
      value,
      type: toFieldType(field.getType()),
      required: !field.isOptional(),
      readOnly: disabled,
      textOnly: textOnly,
      addElement,
      removeElement,
      onFieldValueChange,
    };

    if (field.isArray()) {
      component = (
        <ConcertoArray
          {...commonProps}
          key={`${field.getName()}_wrapper`}
          addElement={(e, id) => addElement(e, id, getDefaultValue(field, parameters))
          }>
          {value
            && value.map((_element, index) => {
              stack.push(index);
              const arrayComponent = (
                <ConcertoArrayElement
                  {...commonProps}
                  index={index}
                  key={`${field.getName()}_wrapper[${index}]`}>
                  {this.visitSingletonField(field, parameters, commonProps)}
                </ConcertoArrayElement>
              );
              stack.pop();
              return arrayComponent;
            })}
        </ConcertoArray>
      );
    } else {
      component = this.visitSingletonField(field, parameters, commonProps);
    }
    stack.pop();
    return component;
  }

  /**
   * Visitor design pattern
   * @param {Field} field - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visitSingletonField(field, parameters, props) {
    const key = pathToString(parameters.stack);
    const value = get(parameters.json, key);
    if (field.isPrimitive()) {
      if (field.getType() === 'Boolean') {
        const { checkboxStyle } = parameters;
        return <ConcertoCheckbox
          {...props}
          id={key}
          key={key}
          value={value}
          toggle={checkboxStyle === 'toggle' ? 'toggle' : undefined}
        />;
      }
      if (toFieldType(field.getType()) === 'datetime-local') {
        return <ConcertoDateTime {...props} id={key} key={key} value={value} />;
      }

      // Allow the client application to override the definition of a basic input
      // field with a Dropdown using their values
      const customSelectorKey = getCustomSelectDecoratorKey(field);
      if (customSelectorKey) {
        const { customSelectors = {} } = parameters;
        const options = customSelectors[customSelectorKey];
        if (!options) {
          throw new Error(`Custom selector key '${customSelectorKey}' not found`);
        }
        return <ConcertoDropdown
          id={key}
          key={`select-${key}`}
          value={value}
          displayText={value}
          textOnly={parameters.textOnly}
          readOnly={parameters.disabled}
          onFieldValueChange={parameters.onFieldValueChange}
          options={options.map(({ value, text }) => ({
            key: `option-${value}`,
            value,
            text,
          }))}
        />;
      }
      return <ConcertoInput {...props} id={key} key={key} value={value} />;
    }
    let type = parameters.modelManager.getType(
      field.getFullyQualifiedTypeName()
    );
    type = findConcreteSubclass(type);

    const decorator = field.getDecorator('FormEditor');
    let name = field.getName();
    if (decorator) {
      const args = decorator.getArguments();
      name = args[1];
    }

    return (
      <Form.Field required={!field.isOptional()} key={name}>
        <ConcertoLabel skip={props.skipLabel} name={name} key={name} />
        {type.accept(this, parameters)}
      </Form.Field>
    );
  }

  /**
   * Visitor design pattern
   * @param {Relationship} relationship - the object being visited
   * @param {Object} parameters  - the parameter
   * @return {Object} the result of visiting or null
   * @private
   */
  visitRelationship(relationship, parameters) {
    const {
      skipLabel,
      disabled,
      textOnly,
      addElement,
      removeElement,
      onFieldValueChange,
      stack,
      relationshipProvider
    } = parameters;

    if (hideProperty(relationship, parameters) || isHidden(relationship)) {
      return null;
    }

    stack.push(relationship.getName());
    const key = pathToString(stack);
    const value = get(parameters.json, key);

    const commonProps = {
      skipLabel: skipLabel || relationship.isArray(),
      id: key,
      field: relationship,
      value,
      type: 'text',
      required: !relationship.isOptional(),
      readOnly: disabled,
      textOnly: textOnly,
      addElement,
      removeElement,
      onFieldValueChange,
      relationshipProvider,
    };

    let component;
    if (relationship.isArray()) {
      const newResource = parameters.modelManager.getFactory().newResource(
        relationship.getNamespace(),
        relationship.getType(),
        'resource1',
        {
          includeOptionalFields: parameters.includeOptionalFields,
          generate: parameters.includeSampleData,
        }
      );
      component = (
        <ConcertoArray
          {...commonProps}
          key={key}
          addElement={(e, id) => addElement(e, id, newResource.toURI())}>
          {value
            && value.map((_element, index) => {
              stack.push(index);
              const key = pathToString(stack);
              const value = get(parameters.json, key);
              const arrayComponent = (
                <ConcertoArrayElement {...commonProps} key={`relationship-${key}-${index}`} index={index}>
                  <ConcertoRelationship {...commonProps} id={key} value={value} />
                </ConcertoArrayElement>
              );
              stack.pop();
              return arrayComponent;
            })}
        </ConcertoArray>
      );
    } else {
      component = <ConcertoRelationship key={key} {...commonProps} value={value} />;
    }

    stack.pop();
    return component;
  }
}

export default ReactFormVisitor;
