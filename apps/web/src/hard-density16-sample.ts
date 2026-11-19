import type { Puzzle } from '@core';

export const hardDensity16Sample: Puzzle = {
  "id": "experimental-10x15-hard-6",
  "title": "Experimental Nurikabe hard #6",
  "difficulty": "hard",
  "definition": {
    "width": 10,
    "height": 15,
    "clues": [
      [1,null,null,null,null,null,null,null,null,3],
      [null,3,null,null,null,null,1,null,null,null],
      [null,null,null,null,2,null,null,null,null,1],
      [null,null,1,null,null,null,null,8,null,null],
      [4,null,null,1,null,null,null,null,null,1],
      [null,null,null,null,4,null,null,null,2,null],
      [null,null,null,null,null,null,null,null,null,null],
      [null,null,3,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null,null,null],
      [null,null,null,2,null,null,null,2,null,null],
      [null,null,null,null,null,2,null,null,null,3],
      [4,null,null,null,4,null,null,null,3,null],
      [null,null,null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null,null,null],
      [4,null,null,null,null,null,null,3,null,2]
    ]
  },
  "solution": {
    "width": 10,
    "height": 15,
    "colors": [
      ["white","black","black","black","black","black","black","white","white","white"],
      ["black","white","white","black","white","black","white","black","black","black"],
      ["black","white","black","black","white","black","black","white","black","white"],
      ["black","black","white","black","black","white","white","white","black","black"],
      ["white","black","black","white","black","black","white","black","black","white"],
      ["white","white","black","black","white","black","white","black","white","black"],
      ["white","black","black","white","white","black","white","black","white","black"],
      ["black","black","white","black","white","black","white","black","black","black"],
      ["black","white","white","black","black","black","black","white","black","white"],
      ["black","black","black","white","black","white","black","white","black","white"],
      ["black","white","black","white","black","white","black","black","black","white"],
      ["white","white","black","black","white","black","black","white","white","black"],
      ["black","white","black","white","white","white","black","white","black","black"],
      ["black","black","black","black","black","black","black","black","black","white"],
      ["white","white","white","white","black","white","white","white","black","white"]
    ]
  }
};
