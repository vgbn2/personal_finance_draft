/*
 * Filename: C01022.c
 * Description: Calculates sums
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
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int n;
        scanf("%d", &n); // Read input
        int sum = 0;
        while (n > 0)
        {
            sum += n % 10;
            n /= 10;
        }
        printf("%d\n", sum); // Print result
    }
    return 0;
}