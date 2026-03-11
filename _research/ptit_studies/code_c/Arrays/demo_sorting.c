/*
 * Filename: demo_sorting.c
 * Description: Sorts an array of elements using functions: print_array
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */


// Import standard libraries
#include <stdio.h>

void print_array(int arr[], int n) {
    printf("[ "); // Print result
    for(int i=0; i<n; i++) printf("%d ", arr[i]); // Print result
    printf("]\n"); // Print result
}

void main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = 7;
    
    printf("\n=== Interactive Demo: Sorting Array ===\n"); // Print result
    printf("Original: "); // Print result
    print_array(arr, n);
    
    printf("\nStart Bubble Sort Visualization:\n"); // Print result
    for(int i=0; i<n-1; i++) {
        int swapped = 0;
        for(int j=0; j<n-i-1; j++) {
            if(arr[j] > arr[j+1]) {
                // Swap
                int temp = arr[j];
                arr[j] = arr[j+1];
                arr[j+1] = temp;
                swapped = 1;
                printf("Swapped %d and %d: ", arr[j+1], arr[j]); // Note: printed indices are post-swap
                print_array(arr, n);
            }
        }
        if(!swapped) break;
    }
    printf("\nSorted Result: "); // Print result
    print_array(arr, n);
}
