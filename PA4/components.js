AFRAME.registerSystem('x1482-gallery', {

  init: function () {
    this.exhibits = [];
    this.selected = null;
    this.motionPaused = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
  },

  registerExhibit: function (el) {
    if (!this.exhibits.includes(el)) {
      this.exhibits.push(el);
    }

    this.updatePanel();
  },

  unregisterExhibit: function (el) {
    const index = this.exhibits.indexOf(el);

    if (index !== -1) {
      this.exhibits.splice(index, 1);
    }

    if (this.selected === el) {
      this.selected = null;
    }

    this.updatePanel();
  },

  selectExhibit: function (el) {
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

    const selectedEl = this.selected;
    this.selected = null;

    if (selectedEl.parentNode) {
      selectedEl.parentNode.removeChild(selectedEl);
    }

    this.updatePanel();
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

  updatePanel: function () {
    const panel = document.querySelector('#info-text');

    if (!panel) return;

    let selectedName = 'none';

    if (this.selected && this.selected.components['x1482-exhibit']) {
      selectedName = this.selected.components['x1482-exhibit'].data.name;
    }

    panel.setAttribute(
      'value',
      'ID: 241482\n' +
      'Theme: Underwater Research Base\n' +
      'Motion: Pulse\n' +
      'Interaction: Gaze\n' +
      'Layout: Corridor\n' +
      'Selected: ' +
      selectedName +
      ' (' +
      (this.selected ? '1' : '0') +
      ' of ' +
      this.exhibits.length +
      ')'
    );
  },

  remove: function () {
    window.removeEventListener('keydown', this.onKeyDown);
  }

});


AFRAME.registerComponent('x1482-motion', {

  schema: {
    type: {
      type: 'string',
      default: 'pulse'
    },

    amplitude: {
      type: 'number',
      default: 0.12
    },

    period: {
      type: 'number',
      default: 2000
    },

    phase: {
      type: 'number',
      default: 0
    }
  },

  init: function () {
    this.baseScale = this.el.object3D.scale.clone();
    this.isPaused = false;
  },

  update: function () {
  },

  tick: function (time) {
    if (this.isPaused) return;

    const angle =
      (time / this.data.period) * Math.PI * 2 + this.data.phase;

    const pulse =
      1 + Math.sin(angle) * this.data.amplitude;

    this.el.object3D.scale.set(
      this.baseScale.x * pulse,
      this.baseScale.y * pulse,
      this.baseScale.z * pulse
    );
  },

  pause: function () {
    this.isPaused = true;
  },

  play: function () {
    this.isPaused = false;
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
    }
  },

  init: function () {
    this.applyTexture();
  },

  update: function () {
    this.applyTexture();
  },

  applyTexture: function () {
    if (!this.data.src) return;

    this.el.setAttribute('material', 'src', this.data.src);
  }
});


AFRAME.registerComponent('x1482-exhibit', {

  schema: {
    name: {
      type: 'string',
      default: 'Exhibit'
    }
  },

  init: function () {
    this.gallery = this.el.sceneEl.systems['x1482-gallery'];

    const material = this.el.getAttribute('material');
    this.originalColor = material ? material.color : '#ffffff';

    if (this.gallery) {
      this.gallery.registerExhibit(this.el);
    }

    this.onMouseEnter = () => {
      this.el.setAttribute('material', 'color', '#7fffd4');
    };

    this.onMouseLeave = () => {
      if (this.gallery && this.gallery.selected === this.el) {
        this.el.setAttribute('material', 'color', '#ffff66');
      } else {
        this.el.setAttribute('material', 'color', this.originalColor);
      }
    };

    this.onClick = () => {
      if (!this.gallery) return;

      this.gallery.selectExhibit(this.el);
      this.el.setAttribute('material', 'color', '#ffff66');
    };

    this.el.addEventListener('mouseenter', this.onMouseEnter);
    this.el.addEventListener('mouseleave', this.onMouseLeave);
    this.el.addEventListener('click', this.onClick);
  },

  remove: function () {
    this.el.removeEventListener('mouseenter', this.onMouseEnter);
    this.el.removeEventListener('mouseleave', this.onMouseLeave);
    this.el.removeEventListener('click', this.onClick);

    if (this.gallery) {
      this.gallery.unregisterExhibit(this.el);
    }
  }

});