import * as THREE from "three";

export interface StarSprite {
  sprite: THREE.Sprite;
}

export class StarryBackdrop {
  private stars: StarSprite[] = [];
  private starGroup: THREE.Group;
  private starTexture: THREE.Texture | null = null;

  constructor() {
    this.starGroup = new THREE.Group();
    this.starGroup.name = "starryBackdrop";
  }

  /**
   * Creates 1000 star sprites positioned for parallax effect
   * @param scene The Three.js scene to add the stars to
   * @returns Array of star sprite objects
   */
  createStarryBackdrop(scene: THREE.Scene): StarSprite[] {
    const numberOfStars = 1500;
    const starY = -1500; // Fixed Y position as requested
    const xRange = 6000; // X range from -900 to 900
    const zRange = 8000; // Z range from -6000 to 6000

    // Create a simple star texture programmatically
    const starTexture = this.createStarTexture();
    this.starTexture = starTexture;

    for (let i = 0; i < numberOfStars; i++) {
      // Random position within the specified range
      const x = (Math.random() - 0.5) * xRange;
      const z = (Math.random() - 0.5) * zRange;

      // Random star properties
      const size = 4 + Math.random() * 8; // 4 to 12 units
      const opacity = 0.6 + Math.random() * 0.4; // 0.6 to 1.0 opacity

      // Create sprite material
      const spriteMaterial = new THREE.SpriteMaterial({
        map: starTexture,
        transparent: true,
        opacity: opacity,
        color: 0xffffff,
      });

      // Create sprite
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, starY, z);
      sprite.scale.set(size, size, size);

      // Add to group
      this.starGroup.add(sprite);

      // Store reference
      this.stars.push({ sprite });
    }

    // Add the entire star group to the scene
    scene.add(this.starGroup);

    return this.stars;
  }

  /**
   * Creates a simple star texture using canvas
   */
  private createStarTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    // Clear canvas
    ctx.clearRect(0, 0, 64, 64);

    // Create radial gradient for star glow
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.3)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    // Draw star
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Gets the star group for scene management
   */
  getStarGroup(): THREE.Group {
    return this.starGroup;
  }

  /**
   * Gets all star sprites
   */
  getStars(): StarSprite[] {
    return this.stars;
  }

  /**
   * Disposes of all star resources
   */
  dispose(): void {
    this.stars.forEach((star) => {
      if (star.sprite.material) {
        // Do not dispose map per sprite; it's a shared texture
        star.sprite.material.dispose();
      }
    });

    this.stars = [];

    // Remove from parent if it has one
    if (this.starGroup.parent) {
      this.starGroup.parent.remove(this.starGroup);
    }

    // Dispose shared texture once
    if (this.starTexture) {
      this.starTexture.dispose();
      this.starTexture = null;
    }
  }
}
