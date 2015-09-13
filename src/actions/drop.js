const base = require('./base');
const utils = require('../utils');
const scope = require('../scope');
const signals = require('../utils/signals');
const Interactable = require('../Interactable');
const defaultOptions = require('../defaultOptions');

const drop = {
  defaults: {
    enabled: false,
    accept : null,
    overlap: 'pointer',
  },

  start: function (interaction, event, dragEvent) {
    // reset active dropzones
    interaction.activeDrops.dropzones = [];
    interaction.activeDrops.elements  = [];
    interaction.activeDrops.rects     = [];

    if (!interaction.dynamicDrop) {
      setActiveDrops(interaction, interaction.element);
    }

    const dropEvents = getDropEvents(interaction, event, dragEvent);

    if (dropEvents.activate) {
      fireActiveDrops(interaction, dropEvents.activate);
    }
  },

  move: function (interaction, event, dragEvent) {
    const draggableElement = interaction.element;
    const dropOptions = getDrop(dragEvent, event, draggableElement);

    interaction.dropTarget  = dropOptions.dropzone;
    interaction.dropElement = dropOptions.element;

    const dropEvents = getDropEvents(interaction, event, dragEvent);

    interaction.target.fire(dragEvent);

    if (dropEvents.leave) { interaction.prevDropTarget.fire(dropEvents.leave); }
    if (dropEvents.enter) {     interaction.dropTarget.fire(dropEvents.enter); }
    if (dropEvents.move ) {     interaction.dropTarget.fire(dropEvents.move ); }

    interaction.prevDropTarget  = interaction.dropTarget;
    interaction.prevDropElement = interaction.dropElement;
  },

  end: function (interaction, event, endEvent) {
    const draggableElement = interaction.element;
    const dropResult = getDrop(endEvent, event, draggableElement);

    interaction.dropTarget  = dropResult.dropzone;
    interaction.dropElement = dropResult.element;

    const dropEvents = getDropEvents(interaction, event, endEvent);

    if (dropEvents.leave) { interaction.prevDropTarget.fire(dropEvents.leave); }
    if (dropEvents.enter) {     interaction.dropTarget.fire(dropEvents.enter); }
    if (dropEvents.drop ) {     interaction.dropTarget.fire(dropEvents.drop ); }
    if (dropEvents.deactivate) {
      fireActiveDrops(interaction, dropEvents.deactivate);
    }
  },

  stop: function (interaction) {
    interaction.activeDrops.dropzones =
      interaction.activeDrops.elements =
      interaction.activeDrops.rects = null;
  },
};

function collectDrops (interaction, element) {
  const drops = [];
  const elements = [];

  element = element || interaction.element;

  // collect all dropzones and their elements which qualify for a drop
  for (const current of scope.interactables) {
    if (!current.options.drop.enabled) { continue; }

    const accept = current.options.drop.accept;

    // test the draggable element against the dropzone's accept setting
    if ((utils.isElement(accept) && accept !== element)
        || (utils.isString(accept)
        && !utils.matchesSelector(element, accept))) {

      continue;
    }

    // query for new elements if necessary
    const dropElements = current.selector
      ? current._context.querySelectorAll(current.selector)
      : [current._element];

    for (let i = 0; i < dropElements.length; i++) {
      const currentElement = dropElements[i];

      if (currentElement !== element) {
        drops.push(current);
        elements.push(currentElement);
      }
    }
  }

  return {
    elements,
    dropzones: drops,
  };
}

function fireActiveDrops (interaction, event) {
  let prevElement;

  // loop through all active dropzones and trigger event
  for (let i = 0; i < interaction.activeDrops.dropzones.length; i++) {
    const current = interaction.activeDrops.dropzones[i];
    const currentElement = interaction.activeDrops.elements [i];

    // prevent trigger of duplicate events on same element
    if (currentElement !== prevElement) {
      // set current element as event target
      event.target = currentElement;
      current.fire(event);
    }
    prevElement = currentElement;
  }
}

// Collect a new set of possible drops and save them in activeDrops.
// setActiveDrops should always be called when a drag has just started or a
// drag event happens while dynamicDrop is true
function setActiveDrops (interaction, dragElement) {
  // get dropzones and their elements that could receive the draggable
  const possibleDrops = collectDrops(interaction, dragElement, true);

  interaction.activeDrops.dropzones = possibleDrops.dropzones;
  interaction.activeDrops.elements  = possibleDrops.elements;
  interaction.activeDrops.rects     = [];

  for (let i = 0; i < interaction.activeDrops.dropzones.length; i++) {
    interaction.activeDrops.rects[i] =
      interaction.activeDrops.dropzones[i].getRect(interaction.activeDrops.elements[i]);
  }
}

function getDrop (dragEvent, event, dragElement) {
  const interaction = dragEvent.interaction;
  const validDrops = [];

  if (scope.dynamicDrop) {
    setActiveDrops(interaction, dragElement);
  }

  // collect all dropzones and their elements which qualify for a drop
  for (let j = 0; j < interaction.activeDrops.dropzones.length; j++) {
    const current        = interaction.activeDrops.dropzones[j];
    const currentElement = interaction.activeDrops.elements [j];
    const rect           = interaction.activeDrops.rects    [j];

    validDrops.push(current.dropCheck(dragEvent, event, interaction.target, dragElement, currentElement, rect)
      ? currentElement
      : null);
  }

  // get the most appropriate dropzone based on DOM depth and order
  const dropIndex = utils.indexOfDeepestElement(validDrops);

  return {
    dropzone: interaction.activeDrops.dropzones[dropIndex] || null,
    element : interaction.activeDrops.elements [dropIndex] || null,
  };
}

function getDropEvents (interaction, pointerEvent, dragEvent) {
  const dropEvents = {
    enter     : null,
    leave     : null,
    activate  : null,
    deactivate: null,
    move      : null,
    drop      : null,
  };

  if (interaction.dropElement !== interaction.prevDropElement) {
    // if there was a prevDropTarget, create a dragleave event
    if (interaction.prevDropTarget) {
      dropEvents.leave = {
        dragEvent,
        interaction,
        target       : interaction.prevDropElement,
        dropzone     : interaction.prevDropTarget,
        relatedTarget: dragEvent.target,
        draggable    : dragEvent.interactable,
        timeStamp    : dragEvent.timeStamp,
        type         : 'dragleave',
      };

      dragEvent.dragLeave    = interaction.prevDropElement;
      dragEvent.prevDropzone = interaction.prevDropTarget;
    }
    // if the dropTarget is not null, create a dragenter event
    if (interaction.dropTarget) {
      dropEvents.enter = {
        dragEvent,
        interaction,
        target       : interaction.dropElement,
        dropzone     : interaction.dropTarget,
        relatedTarget: dragEvent.target,
        draggable    : dragEvent.interactable,
        timeStamp    : dragEvent.timeStamp,
        type         : 'dragenter',
      };

      dragEvent.dragEnter = interaction.dropElement;
      dragEvent.dropzone = interaction.dropTarget;
    }
  }

  if (dragEvent.type === 'dragend' && interaction.dropTarget) {
    dropEvents.drop = {
      dragEvent,
      interaction,
      target       : interaction.dropElement,
      dropzone     : interaction.dropTarget,
      relatedTarget: dragEvent.target,
      draggable    : dragEvent.interactable,
      timeStamp    : dragEvent.timeStamp,
      type         : 'drop',
    };

    dragEvent.dropzone = interaction.dropTarget;
  }
  if (dragEvent.type === 'dragstart') {
    dropEvents.activate = {
      dragEvent,
      interaction,
      target       : null,
      dropzone     : null,
      relatedTarget: dragEvent.target,
      draggable    : dragEvent.interactable,
      timeStamp    : dragEvent.timeStamp,
      type         : 'dropactivate',
    };
  }
  if (dragEvent.type === 'dragend') {
    dropEvents.deactivate = {
      dragEvent,
      interaction,
      target       : null,
      dropzone     : null,
      relatedTarget: dragEvent.target,
      draggable    : dragEvent.interactable,
      timeStamp    : dragEvent.timeStamp,
      type         : 'dropdeactivate',
    };
  }
  if (dragEvent.type === 'dragmove' && interaction.dropTarget) {
    dropEvents.move = {
      dragEvent,
      interaction,
      target       : interaction.dropElement,
      dropzone     : interaction.dropTarget,
      relatedTarget: dragEvent.target,
      draggable    : dragEvent.interactable,
      dragmove     : dragEvent,
      timeStamp    : dragEvent.timeStamp,
      type         : 'dropmove',
    };
    dragEvent.dropzone = interaction.dropTarget;
  }

  return dropEvents;
}

/*\
 * Interactable.dropzone
 [ method ]
 *
 * Returns or sets whether elements can be dropped onto this
 * Interactable to trigger drop events
 *
 * Dropzones can receive the following events:
 *  - `dropactivate` and `dropdeactivate` when an acceptable drag starts and ends
 *  - `dragenter` and `dragleave` when a draggable enters and leaves the dropzone
 *  - `dragmove` when a draggable that has entered the dropzone is moved
 *  - `drop` when a draggable is dropped into this dropzone
 *
 *  Use the `accept` option to allow only elements that match the given CSS selector or element.
 *
 *  Use the `overlap` option to set how drops are checked for. The allowed values are:
 *   - `'pointer'`, the pointer must be over the dropzone (default)
 *   - `'center'`, the draggable element's center must be over the dropzone
 *   - a number from 0-1 which is the `(intersection area) / (draggable area)`.
 *       e.g. `0.5` for drop to happen when half of the area of the
 *       draggable is over the dropzone
 *
 - options (boolean | object | null) #optional The new value to be set.
 | interact('.drop').dropzone({
 |   accept: '.can-drop' || document.getElementById('single-drop'),
 |   overlap: 'pointer' || 'center' || zeroToOne
 | }
 = (boolean | object) The current setting or this Interactable
\*/
Interactable.prototype.dropzone = function (options) {
  if (utils.isObject(options)) {
    this.options.drop.enabled = options.enabled === false? false: true;

    if (utils.isFunction(options.ondrop)          ) { this.ondrop           = options.ondrop          ; }
    if (utils.isFunction(options.ondropactivate)  ) { this.ondropactivate   = options.ondropactivate  ; }
    if (utils.isFunction(options.ondropdeactivate)) { this.ondropdeactivate = options.ondropdeactivate; }
    if (utils.isFunction(options.ondragenter)     ) { this.ondragenter      = options.ondragenter     ; }
    if (utils.isFunction(options.ondragleave)     ) { this.ondragleave      = options.ondragleave     ; }
    if (utils.isFunction(options.ondropmove)      ) { this.ondropmove       = options.ondropmove      ; }

    if (/^(pointer|center)$/.test(options.overlap)) {
      this.options.drop.overlap = options.overlap;
    }
    else if (utils.isNumber(options.overlap)) {
      this.options.drop.overlap = Math.max(Math.min(1, options.overlap), 0);
    }
    if ('accept' in options) {
      this.options.drop.accept = options.accept;
    }
    if ('checker' in options) {
      this.options.drop.checker = options.checker;
    }


    return this;
  }

  if (utils.isBool(options)) {
    this.options.drop.enabled = options;

    return this;
  }

  return this.options.drop;
};

Interactable.prototype.dropCheck = function (dragEvent, event, draggable, draggableElement, dropElement, rect) {
  let dropped = false;

  // if the dropzone has no rect (eg. display: none)
  // call the custom dropChecker or just return false
  if (!(rect = rect || this.getRect(dropElement))) {
    return (this.options.drop.checker
      ? this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement)
      : false);
  }

  const dropOverlap = this.options.drop.overlap;

  if (dropOverlap === 'pointer') {
    const origin = utils.getOriginXY(draggable, draggableElement);
    const page = utils.getPageXY(dragEvent);
    let horizontal;
    let vertical;

    page.x += origin.x;
    page.y += origin.y;

    horizontal = (page.x > rect.left) && (page.x < rect.right);
    vertical   = (page.y > rect.top ) && (page.y < rect.bottom);

    dropped = horizontal && vertical;
  }

  const dragRect = draggable.getRect(draggableElement);

  if (dropOverlap === 'center') {
    const cx = dragRect.left + dragRect.width  / 2;
    const cy = dragRect.top  + dragRect.height / 2;

    dropped = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  if (utils.isNumber(dropOverlap)) {
    const overlapArea  = (Math.max(0, Math.min(rect.right , dragRect.right ) - Math.max(rect.left, dragRect.left))
                          * Math.max(0, Math.min(rect.bottom, dragRect.bottom) - Math.max(rect.top , dragRect.top )));

    const overlapRatio = overlapArea / (dragRect.width * dragRect.height);

    dropped = overlapRatio >= dropOverlap;
  }

  if (this.options.drop.checker) {
    dropped = this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement);
  }

  return dropped;
};

/*\
 * Interactable.dropChecker
 [ method ]
 *
 * DEPRECATED. Use interactable.dropzone({ checker: function... }) instead.
 *
 * Gets or sets the function used to check if a dragged element is
 * over this Interactable.
 *
 - checker (function) #optional The function that will be called when checking for a drop
 = (Function | Interactable) The checker function or this Interactable
 *
 * The checker function takes the following arguments:
 *
 - dragEvent (InteractEvent) The related dragmove or dragend event
 - event (TouchEvent | PointerEvent | MouseEvent) The user move/up/end Event related to the dragEvent
 - dropped (boolean) The value from the default drop checker
 - dropzone (Interactable) The dropzone interactable
 - dropElement (Element) The dropzone element
 - draggable (Interactable) The Interactable being dragged
 - draggableElement (Element) The actual element that's being dragged
 *
 > Usage:
 | interact(target)
 | .dropChecker(function(dragEvent,         // related dragmove or dragend event
 |                       event,             // TouchEvent/PointerEvent/MouseEvent
 |                       dropped,           // bool result of the default checker
 |                       dropzone,          // dropzone Interactable
 |                       dropElement,       // dropzone elemnt
 |                       draggable,         // draggable Interactable
 |                       draggableElement) {// draggable element
 |
 |   return dropped && event.target.hasAttribute('allow-drop');
 | }
\*/
Interactable.prototype.dropChecker = utils.warnOnce(function (checker) {
  if (utils.isFunction(checker)) {
    this.options.drop.checker = checker;

    return this;
  }
  if (checker === null) {
    delete this.options.getRect;

    return this;
  }

  return this.options.drop.checker;
}, 'Interactable#dropChecker is deprecated. use Interactable#dropzone({ dropChecker: checkerFunction }) instead');

/*\
 * Interactable.accept
 [ method ]
 *
 * Deprecated. add an `accept` property to the options object passed to
 * @Interactable.dropzone instead.
 *
 * Gets or sets the Element or CSS selector match that this
 * Interactable accepts if it is a dropzone.
 *
 - newValue (Element | string | null) #optional
 * If it is an Element, then only that element can be dropped into this dropzone.
 * If it is a string, the element being dragged must match it as a selector.
 * If it is null, the accept options is cleared - it accepts any element.
 *
 = (string | Element | null | Interactable) The current accept option if given `undefined` or this Interactable
\*/
Interactable.prototype.accept = utils.warnOnce(function (newValue) {
  if (utils.isElement(newValue)) {
    this.options.drop.accept = newValue;

    return this;
  }

  // test if it is a valid CSS selector
  if (utils.trySelector(newValue)) {
    this.options.drop.accept = newValue;

    return this;
  }

  if (newValue === null) {
    delete this.options.drop.accept;

    return this;
  }

  return this.options.drop.accept;
}, 'Interactable#accept is deprecated. use Interactable#dropzone({ accept: target }) instead');

signals.on('interactable-unset', function ({ interactable }) {
  interactable.dropzone(false);
});

signals.on('interaction-stop', function ({ interaction }) {
  interaction.dropTarget = interaction.dropElement =
    interaction.prevDropTarget = interaction.prevDropElement = null;
});

utils.merge(scope.eventTypes, [
  'dragenter',
  'dragleave',
  'dropactivate',
  'dropdeactivate',
  'dropmove',
  'drop',
]);
base.methodDict.drop = 'dropzone';

defaultOptions.drop = drop.defaults;

module.exports = drop;
