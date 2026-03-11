/*
 * Filename: C01045.c
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
    int a = n;
    while (n > 0)
    {
        if (n < 10)
            printf("%d ", n); // Print result
        n /= 10;
    }
    printf("%d", a % 10); // Print result
    return 0;
}