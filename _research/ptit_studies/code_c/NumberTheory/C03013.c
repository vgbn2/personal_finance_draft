/*
 * Filename: C03013.c
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
    int f[30];
    for (int i = 0; i < n; i++)
    {
        if (i == 0)
            f[i] = 0;
        else if (i == 1)
            f[i] = 1;
        else
            f[i] = f[i - 1] + f[i - 2];
        printf("%d ", f[i]); // Print result
    }
    return 0;
}