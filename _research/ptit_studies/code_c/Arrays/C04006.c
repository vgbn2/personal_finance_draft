/*
 * Filename: C04006.c
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

main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[n];
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    for (int i = n - 1; i >= 0; i--)
        printf("%d ", a[i]); // Print result
}