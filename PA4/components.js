AFRAME.registerSystem('x1482-gallery', {

  init: function () {
    this.exhibits = [];
    this.selected = null;
    this.motionPaused = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
  },

  register: function (el) {
    if (!this.exhibits.includes(el)) {
      this.exhibits.push(el);
    }

    this.updatePanel();
  },

  unregister: function (el) {
    const index = this.exhibits.indexOf(el);

    if (index !== -1) {
      this.exhibits.splice(index, 1);
    }

    if (this.selected === el) {
      this.selected = null;
    }

    this.updatePanel();
  },

  select: function (el) {

    // Selecting the same object again removes selection.
    if (this.selected === el) {
      const current =
        el.components['x1482-exhibit'];

      if (current) {
        current.setSelected(false);
      }

      this.selected = null;
      this.updatePanel();
      return;
    }

    // Remove selection from the old object.
    if (this.selected) {
      const old =
        this.selected.components['x1482-exhibit'];

      if (old) {
        old.setSelected(false);
      }
    }

    // Select the new object.
    this.selected = el;

    const current =
      el.components['x1482-exhibit'];

    if (current) {
      current.setSelected(true);
    }

    this.updatePanel();
  },

  toggleMotion: function () {
    this.motionPaused = !this.motionPaused;

    this.exhibits.forEach((el) => {
      const motion =
        el.components['x1482-motion'];

      if (!motion) return;

      if (this.motionPaused) {
        motion.pause();
      } else {
        motion.play();
      }
    });
  },

  removeSelected: function () {
    if (!this.selected) return;

    const el = this.selected;
    this.selected = null;

    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }

    this.updatePanel();
  },

  updatePanel: function () {
    const panel =
      document.querySelector('#info-text');

    if (!panel) return;

    let name = 'none';

    if (
      this.selected &&
      this.selected.components['x1482-exhibit']
    ) {
      name =
        this.selected.components['x1482-exhibit'].data.name;
    }

    panel.setAttribute(
      'value',
      'ID: 241482\n' +
      'Theme: Underwater Research Base\n' +
      'Motion: Pulse\n' +
      'Interaction: Gaze\n' +
      'Layout: Corridor\n' +
      'Selected: ' + name +
      ' (' + (this.selected ? 1 : 0) +
      ' of ' + this.exhibits.length + ')'
    );
  },

  onKeyDown: function (event) {
    const key = event.key.toLowerCase();

    if (key === 'm') {
      this.toggleMotion();
    }

    if (key === 'x') {
      this.removeSelected();
    }
  },

  remove: function () {
    window.removeEventListener(
      'keydown',
      this.onKeyDown
    );
  }

});


AFRAME.registerComponent('x1482-motion', {

  schema: {
    type: {
      type: 'string',
      default: 'pulse',
      oneOf: ['bob', 'orbit', 'pulse']
    },

    amplitude: {
      type: 'number',
      default: 0.10
    },

    period: {
      type: 'number',
      default: 2500
    },

    phase: {
      type: 'number',
      default: 0
    }
  },

  init: function () {
    this.baseScale =
      this.el.object3D.scale.clone();

    this.paused = false;
  },

  update: function (oldData) {
    if (
      oldData &&
      oldData.type &&
      oldData.type !== this.data.type
    ) {
      this.el.object3D.scale.copy(
        this.baseScale
      );
    }
  },

  tick: function (time) {
    if (this.paused) return;
    if (this.data.type !== 'pulse') return;

    const angle =
      (time / this.data.period) *
      Math.PI * 2 +
      this.data.phase;

    const amount =
      1 +
      Math.sin(angle) *
      this.data.amplitude;

    this.el.object3D.scale.set(
      this.baseScale.x * amount,
      this.baseScale.y * amount,
      this.baseScale.z * amount
    );
  },

  pause: function () {
    this.paused = true;
  },

  play: function () {
    this.paused = false;
  },

  remove: function () {
    if (this.baseScale) {
      this.el.object3D.scale.copy(
        this.baseScale
      );
    }
  }

});


AFRAME.registerComponent('x1482-texture', {

  schema: {
    src: {
      type: 'string',
      default: ''
    },

    repeat: {
      type: 'vec2',
      default: {x: 1, y: 1}
    },

    normalSrc: {
      type: 'string',
      default: ''
    },

    anisotropy: {
      type: 'number',
      default: 1
    }
  },

  init: function () {
    this.applyTexture();
  },

  update: function (oldData) {
    if (
      !oldData ||
      oldData.src !== this.data.src
    ) {
      this.applyTexture();
    }
  },

  applyTexture: function () {
    if (!this.data.src) return;

    this.el.setAttribute(
      'material',
      'src',
      this.data.src
    );

    this.el.setAttribute(
      'material',
      'repeat',
      this.data.repeat.x +
      ' ' +
      this.data.repeat.y
    );
  },

  remove: function () {
    this.el.removeAttribute(
      'material',
      'src'
    );
  }

});


AFRAME.registerComponent('x1482-exhibit', {

  schema: {
    name: {
      type: 'string',
      default: 'Exhibit'
    },

    info: {
      type: 'string',
      default: ''
    }
  },

  init: function () {
    this.gallery =
      this.el.sceneEl.systems['x1482-gallery'];

    this.selected = false;

    const material =
      this.el.getAttribute('material');

    this.originalColor =
      material && material.color
        ? material.color
        : '#ffffff';

    const motion =
      this.el.getAttribute('x1482-motion');

    this.originalAmplitude =
      motion && motion.amplitude !== undefined
        ? motion.amplitude
        : 0.10;


    // Create information card.
    this.card =
      document.createElement('a-entity');

    this.card.setAttribute(
      'position',
      '0 1.7 0'
    );

    this.card.setAttribute(
      'visible',
      false
    );


    // Card background.
    const background =
      document.createElement('a-plane');

    background.setAttribute(
      'width',
      '2'
    );

    background.setAttribute(
      'height',
      '0.6'
    );

    background.setAttribute(
      'color',
      '#062f3a'
    );

    background.setAttribute(
      'opacity',
      '0.9'
    );


    // Card text.
    const text =
      document.createElement('a-text');

    text.setAttribute(
      'value',
      this.data.name +
      '\n' +
      this.data.info
    );

    text.setAttribute(
      'align',
      'center'
    );

    text.setAttribute(
      'color',
      '#ffffff'
    );

    text.setAttribute(
      'width',
      '2'
    );

    text.setAttribute(
      'position',
      '0 0 0.01'
    );


    this.card.appendChild(background);
    this.card.appendChild(text);

    this.el.appendChild(this.card);


    if (this.gallery) {
      this.gallery.register(this.el);
    }
  },

  events: {

    mouseenter: function () {
      if (!this.selected) {
        this.el.setAttribute(
          'material',
          'color',
          '#7fffd4'
        );
      }
    },

    mouseleave: function () {
      if (!this.selected) {
        this.el.setAttribute(
          'material',
          'color',
          this.originalColor
        );
      }
    },

    click: function () {
      if (!this.gallery) return;

      this.gallery.select(this.el);
    }
  },

  setSelected: function (value) {
    this.selected = value;

    if (this.card) {
      this.card.setAttribute(
        'visible',
        value
      );
    }

    if (value) {

      this.el.setAttribute(
        'material',
        'color',
        '#ffff66'
      );

      // Change motion through setAttribute.
      this.el.setAttribute(
        'x1482-motion',
        'amplitude',
        this.originalAmplitude * 1.8
      );

    } else {

      this.el.setAttribute(
        'material',
        'color',
        this.originalColor
      );

      this.el.setAttribute(
        'x1482-motion',
        'amplitude',
        this.originalAmplitude
      );
    }
  },

  remove: function () {
    if (this.gallery) {
      this.gallery.unregister(this.el);
    }
  }

});