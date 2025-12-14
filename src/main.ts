import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Main application class for the Roman Coin Kiosk
 * Manages 3D scene, annotations, and user interactions
 */
class CoinKiosk {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private wireframe: THREE.LineSegments | null = null;
  private annotations: Array<{ 
    position: THREE.Vector3; 
    label: string;
    description: string;
    color: string;
    shape: string;
    marker?: CSS2DObject;
    mesh?: THREE.Mesh;
  }> = [];
  private autoSpinEnabled = false;
  private currentEditIndex: number | null = null;
  private isDragging = false;
  private draggedAnnotationIndex: number | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animationId: number | null = null;

  constructor() {
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x505050);

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(5, 3, 5);

    // Initialize WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container')!.appendChild(this.renderer.domElement);

    // Initialize CSS2D renderer for labels
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    document.getElementById('canvas-container')!.appendChild(this.labelRenderer.domElement);

    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 20;

    // Add lighting
    this.setupLighting();

    // Create initial terrain mesh (placeholder)
    this.createTerrainMesh();

    // Set up annotations
    this.setupAnnotations();

    // Set up UI event listeners
    this.setupEventListeners();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start animation loop
    this.animate();
  }

  /**
   * Set up scene lighting for optimal coin visualization
   */
  private setupLighting(): void {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 5, 5);
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 0, -5);
    this.scene.add(fillLight);

    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -5, 0);
    this.scene.add(rimLight);
  }

  /**
   * Load the Roman coin 3D model
   */
  private createTerrainMesh(): void {
    const loader = new GLTFLoader();
    
    loader.load(
      '/gold coin 3d model.glb',
      (gltf) => {
        console.log('Coin model loaded successfully');
        
        // Get the loaded model
        const coinModel = gltf.scene;
        
        // Center the model
        const box = new THREE.Box3().setFromObject(coinModel);
        const center = box.getCenter(new THREE.Vector3());
        coinModel.position.sub(center);
        
        // Scale if needed (adjust this value based on your model size)
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim; // Scale to fit roughly 2 units
        coinModel.scale.setScalar(scale);
        
        // Apply gold material to all meshes
        coinModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Store the first mesh for wireframe
            if (!this.mesh) {
              this.mesh = child;
            }
            
            // Apply gold PBR material
            child.material = new THREE.MeshStandardMaterial({
              color: 0xFFD700, // Gold color
              metalness: 0.9,
              roughness: 0.2,
              envMapIntensity: 1.0,
            });
            
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        this.scene.add(coinModel);
        
        // Create wireframe overlay
        if (this.mesh) {
          const wireframeGeometry = new THREE.WireframeGeometry(this.mesh.geometry);
          const wireframeMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000, 
            linewidth: 1,
            transparent: true,
            opacity: 0.3
          });
          this.wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
          this.wireframe.visible = false;
          coinModel.add(this.wireframe); // Add to coin model so it transforms together
        }
      },
      (progress) => {
        console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading coin model:', error);
        // Fallback: create a simple coin-shaped cylinder
        this.createFallbackCoin();
      }
    );
  }

  /**
   * Create a fallback coin if model fails to load
   */
  private createFallbackCoin(): void {
    const geometry = new THREE.CylinderGeometry(1, 1, 0.1, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      metalness: 0.9,
      roughness: 0.2,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Create wireframe
    const wireframeGeometry = new THREE.WireframeGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ 
      color: 0x000000, 
      linewidth: 1,
      transparent: true,
      opacity: 0.3
    });
    this.wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    this.wireframe.visible = false;
    this.scene.add(this.wireframe);
  }

  /**
   * Set up annotation markers in 3D space for coin features
   */
  private setupAnnotations(): void {
    // Single scholarly annotation for inscription
    this.annotations = [
      { 
        position: new THREE.Vector3(0.9, 0.05, 0.2), 
        label: 'Imperial Inscription', 
        description: 'The Latin inscription names the emperor and asserts his authority, functioning as both identification and propaganda.',
        color: '#8b7ba8', 
        shape: 'sphere' 
      }
    ];

    this.renderAnnotations();
  }

  /**
   * Render or re-render all annotations
   */
  private renderAnnotations(): void {
    // Clear existing markers
    this.scene.children = this.scene.children.filter(child => 
      !(child.userData && child.userData.isAnnotationMarker)
    );

    this.annotations.forEach((annotation, index) => {
      // Create sleek circular marker (small ring)
      const markerGeometry = new THREE.RingGeometry(0.03, 0.04, 32);
      const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(annotation.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(annotation.position);
      marker.userData.isAnnotationMarker = true;
      marker.userData.annotationIndex = index;
      
      // Orient marker to face camera
      marker.lookAt(this.camera.position);
      
      this.scene.add(marker);
      annotation.mesh = marker;

      // Calculate label position far away from coin
      const labelOffset = annotation.position.clone().normalize().multiplyScalar(2.5);
      
      // Create thin line from marker to label (not from center)
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        annotation.position.clone(),
        labelOffset.clone()
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: new THREE.Color(annotation.color),
        linewidth: 1,
        transparent: true,
        opacity: 0.4
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.userData.isAnnotationMarker = true;
      this.scene.add(line);

      // Create museum-grade CSS2D label
      const labelDiv = document.createElement('div');
      labelDiv.className = 'annotation-label scholarly';
      
      const titleSpan = document.createElement('div');
      titleSpan.className = 'annotation-title';
      titleSpan.textContent = annotation.label;
      
      const descSpan = document.createElement('div');
      descSpan.className = 'annotation-description';
      descSpan.textContent = annotation.description;
      
      labelDiv.appendChild(titleSpan);
      labelDiv.appendChild(descSpan);
      
      const label = new CSS2DObject(labelDiv);
      
      // Position label far away from coin to avoid overlap
      // Calculate offset based on marker position - push far outward
      const offset = annotation.position.clone().normalize().multiplyScalar(2.5);
      label.position.copy(offset);
      
      marker.add(label);

      annotation.marker = label;
    });

    // Update UI list
    this.updateAnnotationList();
  }

  /**
   * Get geometry for annotation marker based on shape type
   */
  private getMarkerGeometry(shape: string): THREE.BufferGeometry {
    const size = 0.05;
    switch (shape) {
      case 'cube':
        return new THREE.BoxGeometry(size * 2, size * 2, size * 2);
      case 'cone':
        return new THREE.ConeGeometry(size, size * 2, 16);
      case 'cylinder':
        return new THREE.CylinderGeometry(size, size, size * 2, 16);
      case 'sphere':
      default:
        return new THREE.SphereGeometry(size, 16, 16);
    }
  }

  /**
   * Update the annotation list in the UI
   */
  private updateAnnotationList(): void {
    const annotationList = document.getElementById('annotation-list');
    if (!annotationList) return;

    annotationList.innerHTML = this.annotations.map((ann, index) => `
      <li data-index="${index}">
        <span class="annotation-text">${ann.label}</span>
      </li>
    `).join('');
  }

  /**
   * Add a new annotation
   */
  private addAnnotation(label: string, position: THREE.Vector3, color = '#8b7ba8', shape = 'sphere', description = ''): void {
    this.annotations.push({ position, label, description, color, shape });
    this.renderAnnotations();
  }

  /**
   * Update an existing annotation
   */
  private updateAnnotation(index: number, label: string, position: THREE.Vector3, color: string, shape: string, description: string): void {
    if (this.annotations[index]) {
      this.annotations[index].label = label;
      this.annotations[index].position = position;
      this.annotations[index].color = color;
      this.annotations[index].shape = shape;
      this.annotations[index].description = description;
      this.renderAnnotations();
    }
  }

  /**
   * Delete an annotation
   */
  private deleteAnnotation(index: number): void {
    this.annotations.splice(index, 1);
    this.renderAnnotations();
  }

  /**
   * Set up UI event listeners for panels and controls
   */
  private setupEventListeners(): void {
    // Annotation list clicks
    const annotationList = document.getElementById('annotation-list');
    annotationList?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Handle list item click (focus camera)
      if (target.tagName === 'LI' || target.classList.contains('annotation-text')) {
        const li = target.tagName === 'LI' ? target : target.closest('li');
        const index = parseInt(li?.dataset.index || '0');
        this.focusOnAnnotation(index);
        
        // Update active state
        annotationList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        if (li) li.classList.add('active');
      }
    });

    // Lock position toggle
    const lockPosition = document.getElementById('lock-position') as HTMLInputElement;
    lockPosition?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.controls.enabled = !target.checked;
    });

    // Screenshot button
    const screenshotBtn = document.getElementById('take-screenshot');
    screenshotBtn?.addEventListener('click', () => this.takeScreenshot());

    // Autospin toggle
    const autospin = document.getElementById('autospin') as HTMLInputElement;
    autospin?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.autoSpinEnabled = target.checked;
    });

    // Wireframe toggle
    const wireframe = document.getElementById('wireframe') as HTMLInputElement;
    wireframe?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (this.wireframe) {
        this.wireframe.visible = target.checked;
      }
    });

    // Solid color toggle
    const solidColor = document.getElementById('solid-color') as HTMLInputElement;
    solidColor?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (this.mesh && this.mesh.material instanceof THREE.MeshStandardMaterial) {
        if (target.checked) {
          this.mesh.material.color.setHex(0xcccccc);
        } else {
          this.mesh.material.color.setHex(0x8b7355);
        }
      }
    });
    
    // Add annotation button
    const addAnnotationBtn = document.getElementById('add-annotation');
    addAnnotationBtn?.addEventListener('click', () => {
      this.addNewAnnotation();
    });

    // Mouse events for dragging annotations
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());
  }

  /**
   * Add a new annotation at default position
   */
  private addNewAnnotation(): void {
    const position = new THREE.Vector3(0, 0.2, 1);
    const label = `Annotation ${this.annotations.length + 1}`;
    const description = 'Add your annotation description here.';
    this.addAnnotation(label, position, '#8b7ba8', 'sphere', description);
    
    // Open edit modal for the new annotation
    this.openEditModal(this.annotations.length - 1);
  }

  /**
   * Handle mouse down for dragging
   */
  private onMouseDown(event: MouseEvent): void {
    if (this.currentEditIndex === null) return;
    
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersects = this.raycaster.intersectObjects(
      this.scene.children.filter(obj => obj.userData.isAnnotationMarker)
    );
    
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj.userData.annotationIndex === this.currentEditIndex) {
        this.isDragging = true;
        this.draggedAnnotationIndex = this.currentEditIndex;
        this.controls.enabled = false;
      }
    }
  }

  /**
   * Handle mouse move for dragging
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || this.draggedAnnotationIndex === null) return;
    
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Create an invisible sphere to raycast against
    const sphereGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const sphere = new THREE.Mesh(sphereGeometry);
    
    const intersects = this.raycaster.intersectObject(sphere);
    
    if (intersects.length > 0) {
      const newPosition = intersects[0].point;
      this.annotations[this.draggedAnnotationIndex].position.copy(newPosition);
      
      // Update marker position
      if (this.annotations[this.draggedAnnotationIndex].mesh) {
        this.annotations[this.draggedAnnotationIndex].mesh!.position.copy(newPosition);
      }
      
      // Re-render to update lines
      this.renderAnnotations();
    }
  }

  /**
   * Handle mouse up to stop dragging
   */
  private onMouseUp(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedAnnotationIndex = null;
      this.controls.enabled = true;
    }
  }

  /**
   * Open edit modal for annotation
   */
  private openEditModal(index: number): void {
    this.currentEditIndex = index;
    const annotation = this.annotations[index];
    
    const modal = document.getElementById('edit-modal') as HTMLElement;
    const modalTitle = document.getElementById('modal-title') as HTMLElement;
    const labelInput = document.getElementById('edit-label') as HTMLInputElement;
    const colorInput = document.getElementById('edit-color') as HTMLInputElement;
    const shapeSelect = document.getElementById('edit-shape') as HTMLSelectElement;
    
    // Update title
    modalTitle.textContent = index >= 0 && annotation ? 'Edit Annotation' : 'Add Annotation';
    
    // Populate form
    labelInput.value = annotation.label;
    colorInput.value = annotation.color;
    shapeSelect.value = annotation.shape;
    
    modal.style.display = 'flex';
    
    // Set up modal buttons (if not already set up)
    const saveBtn = document.getElementById('save-edit');
    const cancelBtn = document.getElementById('cancel-edit');
    
    saveBtn?.removeEventListener('click', this.saveEdit);
    cancelBtn?.removeEventListener('click', this.closeEditModal);
    
    saveBtn?.addEventListener('click', () => this.saveEdit());
    cancelBtn?.addEventListener('click', () => this.closeEditModal());
  }

  /**
   * Save edit from modal
   */
  private saveEdit(): void {
    if (this.currentEditIndex === null) return;
    
    const labelInput = document.getElementById('edit-label') as HTMLInputElement;
    const colorInput = document.getElementById('edit-color') as HTMLInputElement;
    const shapeSelect = document.getElementById('edit-shape') as HTMLSelectElement;
    
    const label = labelInput.value.trim();
    const position = this.annotations[this.currentEditIndex].position;
    const color = colorInput.value;
    const shape = shapeSelect.value;
    
    this.updateAnnotation(this.currentEditIndex, label, position, color, shape);
    this.closeEditModal();
  }

  /**
   * Close edit modal
   */
  private closeEditModal(): void {
    const modal = document.getElementById('edit-modal') as HTMLElement;
    modal.style.display = 'none';
    this.currentEditIndex = null;
  }

  /**
   * Focus camera on specific annotation with smooth transition
   */
  private focusOnAnnotation(index: number): void {
    if (index >= 0 && index < this.annotations.length) {
      const annotation = this.annotations[index];
      const targetPosition = annotation.position.clone();
      
      // Calculate camera position relative to annotation
      const offset = new THREE.Vector3(2, 1.5, 2);
      const cameraTarget = targetPosition.clone().add(offset);

      // Smooth camera transition
      this.animateCameraTo(cameraTarget, targetPosition);
    }
  }

  /**
   * Animate camera to target position and look-at point
   */
  private animateCameraTo(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 1000; // ms
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress;

      this.camera.position.lerpVectors(startPosition, position, eased);
      this.controls.target.lerpVectors(startTarget, lookAt, eased);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Export current canvas view as PNG
   */
  private takeScreenshot(): void {
    this.renderer.render(this.scene, this.camera);
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    
    const link = document.createElement('a');
    link.download = `coin-screenshot-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  /**
   * Handle window resize events
   */
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Main animation loop
   */
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Auto-rotation
    if (this.autoSpinEnabled && this.mesh) {
      this.mesh.rotation.z += 0.005;
      if (this.wireframe) {
        this.wireframe.rotation.z += 0.005;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };
}

// Initialize the application
new CoinKiosk();

