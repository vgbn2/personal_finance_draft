/*
 * Filename: C04020.c
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
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    int k;
    scanf("%d", &k); // Read input
    for (int i = 0; i < n; i++)
    {
        if (i < n - k)
            printf("%d ", a[i + k]); // Print result
        else
            printf("%d ", a[i - (n - k)]); // Print result
    }
    return 0;
}