/*
 * Filename: demo_matrices.c
 * Description: Performs matrix operations
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */


// Import standard libraries
#include <stdio.h>

void main() {
    int m=2, n=2, p=2;
    int A[2][2] = {{1, 2}, {3, 4}};
    int B[2][2] = {{5, 6}, {7, 8}};
    int C[2][2] = {0};
    
    printf("\n=== Interactive Demo: Matrix Multiplication ===\n"); // Print result
    printf("Matrix A:\n1 2\n3 4\n"); // Print result
    printf("Matrix B:\n5 6\n7 8\n"); // Print result
    
    printf("\nMultiplying...\n"); // Print result
    for(int i=0; i<m; i++) {
        for(int j=0; j<p; j++) {
            printf("Calculating C[%d][%d]: ", i, j); // Print result
            for(int k=0; k<n; k++) {
                C[i][j] += A[i][k] * B[k][j];
                printf("(%d*%d) ", A[i][k], B[k][j]); // Print result
                if(k < n-1) printf("+ "); // Print result
            }
            printf("= %d\n", C[i][j]); // Print result
        }
    }
    
    printf("\nResult Matrix C:\n"); // Print result
    for(int i=0; i<m; i++) {
        for(int j=0; j<p; j++) {
            printf("%d ", C[i][j]); // Print result
        }
        printf("\n"); // Print result
    }
}
