/*
 * Filename: FPT001.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[n][n];
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < i; j++)
            printf("0 "); // Print result
        int id = 0;
        for (int j = i; j < n; j++)
            printf("%d ", id++); // Print result
        printf("\n"); // Print result
    }
    return 0;
}