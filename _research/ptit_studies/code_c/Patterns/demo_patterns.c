/*
 * Filename: demo_patterns.c
 * Description: Prints a pattern
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */


// Import standard libraries
#include <stdio.h>
#include <unistd.h> // For sleep (linux) or Windows Sleep

void main() {
    int n;
    printf("\n=== Interactive Demo: Patterns ===\n"); // Print result
    printf("Enter size N (e.g. 5): "); // Print result
    scanf("%d", &n); // Read input
    
    printf("\nDrawing Triangle... (watch it grow!)\n"); // Print result
    for(int i=1; i<=n; i++) {
        for(int j=1; j<=i; j++) {
            printf("* "); // Print result
            // Simple delay to make it "interactive/visual"
            // For standard C, loops run fast. 
        }
        printf("\n"); // Print result
    }
    
    printf("\nDrawing Square Box...\n"); // Print result
    for(int i=1; i<=n; i++) {
        for(int j=1; j<=n; j++) {
            if(i==1 || i==n || j==1 || j==n) printf("* "); // Print result
            else printf("  "); // Print result
        }
        printf("\n"); // Print result
    }
}
