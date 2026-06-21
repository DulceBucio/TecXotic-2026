import open3d as o3d
import numpy as np
import os, struct
from pathlib import Path

# Fixed path to the folder where captured images live and where the
# resulting .ply model will be saved. Always used, regardless of
# command-line arguments.
IMAGE_FOLDER = "C:/Users/tu_usuario/Downloads"


def read_colmap_points3D_bin(path):
    """Manually parse COLMAP's binary points3D.bin into an Open3D point cloud."""
    points = []
    colors = []

    with open(path, "rb") as f:
        num_points = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_points):
            f.read(8)                              # point3D_id (uint64)
            xyz = struct.unpack("<ddd", f.read(24))  # x, y, z
            rgb = struct.unpack("<BBB", f.read(3))   # r, g, b
            f.read(8)                              # error (double)
            track_length = struct.unpack("<Q", f.read(8))[0]
            f.read(8 * track_length)               # track data

            points.append(xyz)
            colors.append([c / 255.0 for c in rgb])

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(points))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))
    return pcd


def pointcloud_to_mesh(pcd):
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    pcd.orient_normals_consistent_tangent_plane(100)

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=9
    )

    density_threshold = np.quantile(np.asarray(densities), 0.01)
    vertices_to_remove = np.asarray(densities) < density_threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)
    return mesh


def reconstruct(image_folder: str, output_filename: str = "output.ply"):
    # Resolve image_folder to an absolute path so everything derived from it
    # (workspace, output file) lands in a predictable, real location on disk
    # regardless of which directory the script was launched from.
    image_folder = Path(image_folder).resolve()

    if not image_folder.is_dir():
        raise FileNotFoundError(f"Image folder not found: {image_folder}")

    # The .ply is saved INSIDE image_folder, next to the source images,
    # using an absolute path built from image_folder itself.
    output_path = image_folder / output_filename

    output_folder = image_folder / "colmap_output"
    output_folder.mkdir(exist_ok=True)

    print(f"[0/3] Using image folder: {image_folder}")
    print(f"      Output will be saved to: {output_path}")

    print("[1/3] Running COLMAP...")
    exit_code = os.system(
        f'colmap automatic_reconstructor '
        f'--image_path "{image_folder}" '
        f'--workspace_path "{output_folder}" '
        f'--dense 0'
    )
    if exit_code != 0:
        raise RuntimeError(f"COLMAP exited with a non-zero code ({exit_code}).")

    sparse_path = output_folder / "sparse/0/points3D.bin"
    if not sparse_path.exists():
        raise FileNotFoundError(
            "COLMAP output not found — check image quality and overlap."
        )

    print("[2/3] Parsing point cloud...")
    pcd = read_colmap_points3D_bin(sparse_path)
    print(f"      {len(pcd.points)} points loaded")

    if len(pcd.points) < 100:
        raise ValueError(
            f"Too few points ({len(pcd.points)}) — improve image overlap and rerun."
        )

    print("[3/3] Reconstructing mesh...")
    mesh = pointcloud_to_mesh(pcd)

    o3d.io.write_triangle_mesh(str(output_path), mesh)
    print(f"✓ Saved to {output_path}")


if __name__ == "__main__":
    reconstruct(IMAGE_FOLDER, "output.ply")