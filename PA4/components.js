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
    if (this.selected && this.selected !== el) {
      const old = this.selected.components['x1482-exhibit'];

      if (old) {
        this.selected.setAttribute(
          'material',
          'color',
          old.originalColor
        );
      }
    }

    this.selected = el;
    this.updatePanel();
  },

  toggleMotion: function () {
    this.motionPaused = !this.motionPaused;

    this.exhibits.forEach((el) => {
      const motion = el.components['x1482-motion'];

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
  },

  updatePanel: function () {
    const panel = document.querySelector('#info-text');

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
    window.removeEventListener('keydown', this.onKeyDown);
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
    this.baseScale = this.el.object3D.scale.clone();
    this.paused = false;
  },

  update: function (oldData) {
    if (
      oldData &&
      oldData.type &&
      oldData.type !== this.data.type
    ) {
      this.el.object3D.scale.copy(this.baseScale);
    }
  },

  tick: function (time) {
    if (this.paused) return;
    if (this.data.type !== 'pulse') return;

    const angle =
      (time / this.data.period) * Math.PI * 2 +
      this.data.phase;

    const amount =
      1 + Math.sin(angle) * this.data.amplitude;

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
      this.el.object3D.scale.copy(this.baseScale);
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
    if (!oldData || oldData.src !== this.data.src) {
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
      this.data.repeat.x + ' ' + this.data.repeat.y
    );
  },

  remove: function () {
    this.el.removeAttribute('material', 'src');
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

    const material =
      this.el.getAttribute('material');

    this.originalColor =
      material && material.color
        ? material.color
        : '#ffffff';

    if (this.gallery) {
      this.gallery.register(this.el);
    }
  },

  events: {

    mouseenter: function () {
      this.el.setAttribute(
        'material',
        'color',
        '#7fffd4'
      );
    },

    mouseleave: function () {
      if (
        this.gallery &&
        this.gallery.selected === this.el
      ) {
        this.el.setAttribute(
          'material',
          'color',
          '#ffff66'
        );
      } else {
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

      this.el.setAttribute(
        'material',
        'color',
        '#ffff66'
      );
    }
  },

  remove: function () {
    if (this.gallery) {
      this.gallery.unregister(this.el);
    }
  }

});