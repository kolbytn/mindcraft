import json
import matplotlib.pyplot as plt
import numpy as np

def display_3d_blocks(data):
    """Displays a 3D array of blocks with different types in a single figure with subplots for each level,
    including block coordinates. Dynamically adjusts the height of the figure.

    Args:
        data: A dictionary containing the block data, structured like the JSON example.
    """

    block_types = {
        "air": "#FFFFFF",          # White
        "oak_planks": "#8B4513",   # Saddle Brown
        "stone_bricks": "#808080", # Gray
        "oak_door": "#A0522D",      # Sienna
        "oak_stairs": "#D2691E",    # Chocolate
        "quartz_block": "#FFFFF0",  # Ivory
        "glass_pane": "#00CED1",    # Dark Turquoise
        "torch": "#FF8C00"          # Dark Orange
    }

    # Extract data from the JSON
    levels = data["levels"]
    num_levels = len(levels)

    # Create a figure and subplots grid
    fig, axes = plt.subplots(num_levels, 1, figsize=(10, 5 * num_levels))  # One column, dynamic height
    axes[0].legend(handles=[plt.Rectangle((0, 0), 1, 1, color=color) for color in block_types.values()], 
           labels=block_types.keys(), loc='upper right')
    starting_coords = levels[0]["coordinates"]

    # Iterate over each level and corresponding subplot
    for i, level in enumerate(levels):
        ax = axes[i]
        ax.set_title(f"Level {level['level']}")
        placement = level["placement"]

        # Convert placement data to NumPy array
        block_array = np.array([
            [block_types.get(block, 'gray') for block in row] for row in placement
        ])

        # Iterate over each block in the level
        for x in range(block_array.shape[1]):
            for y in range(block_array.shape[0]):
                block_type = block_array[y, x]

                # Plot the block as a rectangle
                rect = plt.Rectangle((x, y), 1, 1, color=block_type)
                ax.add_patch(rect)

                # Add coordinate text to the center of the block
                real_x = x + starting_coords[0]
                real_y = level['level'] + starting_coords[1]
                real_z = y + starting_coords[2]
                ax.text(x + 0.5, y + 0.5, f"({real_x},{real_y},{real_z})", ha='center', va='center', fontsize=8)

        # Set axis limits and labels
        ax.set_xlim([0, block_array.shape[1]])
        ax.set_ylim([0, block_array.shape[0]])
        ax.set_xlabel("X")
        ax.set_ylabel("Y")

    
    plt.tight_layout()  # Adjust spacing between subplots
    # plt.show()
    plt.savefig("construction_tasks/church_three_agents.pdf", bbox_inches='tight')

# Example usage:
with open("construction_tasks/custom/church_three_agents.json", "r") as f:
    data = json.load(f)
    data = data["church_three_agents"]["blueprint"]

display_3d_blocks(data)