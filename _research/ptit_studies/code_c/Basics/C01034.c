/*
 * Filename: C01034.c
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
#include <math.h>

// Entry point
int main()
{
    int a, b;
    scanf("%d%d", &a, &b); // Read input
    int m = ceil(sqrt(a));
    int n = floor(sqrt(b));
    printf("%d\n", n - m + 1); // Print result
    for (int i = m; i <= n; i++)
    {
        printf("%d\n", i * i); // Print result
    }
    return 0;
}