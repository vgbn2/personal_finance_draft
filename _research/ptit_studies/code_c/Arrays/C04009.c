/*
 * Filename: C04009.c
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
    int a[100];
    int c[100], nc = 0;
    int l[100], nl = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] % 2 == 0)
            c[nc++] = a[i];
        else
            l[nl++] = a[i];
    }
    for (int i = 0; i < nc; i++)
        printf("%d ", c[i]); // Print result
    printf("\n"); // Print result
    for (int i = 0; i < nl; i++)
        printf("%d ", l[i]); // Print result
    return 0;
}